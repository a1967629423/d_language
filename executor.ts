import type { AST } from "./d_language_lib";
import { createInterface } from "readline";

export class Context {
  /** 流程控制状态,在return时此值会被设置为return值 */
  exit: Value | undefined = undefined;
  break: Value | undefined = undefined;
  continue: Value | undefined = undefined;
  get NormalExit() {
    if (this.exit !== undefined) return this.exit;
    if (this.break !== undefined) return this.break;
    if (this.continue !== undefined) return this.continue;
    return undefined;
  }
  constructor(
    public paramMap: Map<string, Value> = new Map(),
    public parent?: Context,
    public children: Context[] = []
  ) {}
  resetControlFlow() {
    this.exit = undefined;
    this.break = undefined;
    this.continue = undefined;
  }
  searchInContext(name: string): [Value, Context] {
    if (this.paramMap.has(name)) {
      return [this.paramMap.get(name)!, this];
    }
    if (this.parent) {
      return this.parent.searchInContext(name);
    }
    throw new Error(`can't find identity: ${name}`);
  }
  declareParam(name: string, value: Value) {
    this.paramMap.set(name, value);
  }
  setValue(name: string, value: Value) {
    this.paramMap.set(name, value);
  }
  makeChild() {
    const newChild = new Context();
    this.children.push(newChild);
    newChild.parent = this;
    return newChild;
  }
}
class FunctionExecutor {
  constructor(public ctx: Context) {}
  call(params: Value[]): Value {
    return null;
  }
}
class DynamicFunctionExecutor extends FunctionExecutor {
  constructor(
    public ast: AST | null | undefined,
    public argNames: string[],
    public ctx: Context
  ) {
    super(ctx);
  }
  call(params: Value[]): Value {
    if (!this.ast) return null;
    for (let i = 0; i < this.argNames.length; i++) {
      if (i > params.length) {
        this.ctx.declareParam(this.argNames[i], null);
      } else {
        this.ctx.declareParam(this.argNames[i], params[i]);
      }
    }
    this.ctx.resetControlFlow();
    return executeAST(this.ast, this.ctx);
  }
}
class InternalFunctionExecutor extends FunctionExecutor {
  constructor(public func: (...args: Value[]) => Value) {
    super(new Context());
  }
  override call(params: Value[]): Value {
    return this.func(...params);
  }
}
function wrapperValue(v: any): Value {
  if (v instanceof Function) {
    new InternalWrapperFunction(v);
  }
  return v;
}
function unWrapperValue(v: Value) {
  if (v instanceof FunctionExecutor) {
    if (v instanceof InternalFunctionExecutor) {
      return v.func;
    }
    if (v instanceof InternalWrapperFunction) {
      return v.getBindFunc();
    }
    return null;
  }
  return v;
}
class InternalWrapperFunction extends FunctionExecutor {
  constructor(public func: (...args: any[]) => any, public target?: any) {
    super(new Context());
  }
  getBindFunc() {
    if (this.target) {
      return this.func.bind(this.target);
    }
    return this.func;
  }
  override call(params: Value[]): Value {
    if (this.target) {
      return wrapperValue(
        this.func.apply(this.target, params.map(unWrapperValue))
      );
    } else {
      return wrapperValue(this.func(params.map(unWrapperValue)));
    }
  }
}
type Value =
  | number
  | string
  | boolean
  | null
  | object
  | Map<string, Value>
  | Value[]
  | FunctionExecutor;
const InternalFunctionMap: Map<string, FunctionExecutor> = new Map([
  [
    "print",
    new InternalFunctionExecutor((...args: Value[]) => {
      console.log(...args);
      return null;
    }),
  ],
  [
    "time",
    new InternalFunctionExecutor(() => {
      return Date.now();
    }),
  ],
  [
    "input",
    new InternalFunctionExecutor((...args: Value[]) => {
      const question = (args[0] as string) ?? "";
      const callback = args[1] as FunctionExecutor;
      if (!callback) {
        throw new Error(`input require callback`);
      }
      const readlineInterface = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      readlineInterface.question(question, (answer) => {
        callback.call([answer]);
        readlineInterface.close();
      });
      return null;
    }),
  ],
  [
    "rand",
    new InternalFunctionExecutor(() => {
      return Math.random();
    }),
  ],
  [
    "setTimeout",
    new InternalFunctionExecutor((...args: Value[]) => {
      const time = args[0] as number;
      const cb =args[1] as FunctionExecutor;
      if (typeof time !== "number") throw new Error(`time must be a number`);
      if(!(cb instanceof FunctionExecutor)){
        throw new Error(`cb must be a function`);
      }
      setTimeout(()=>{
        cb.call([]);
      }, time)
      return null;
    }),
  ],
  [
    "len",
    new InternalFunctionExecutor((value:Value)=>{
      if(value instanceof Array) {
        return value.length;
      }
      if(value instanceof Map) {
        return value.size;
      }
      if(value instanceof Object) {
        return Object.keys(value).length;
      }
      return 0;
    })
  ],
  [
    "append",
    new InternalFunctionExecutor((array:Value,value:Value)=>{
      if(array instanceof Array) {
        array.push(value);
        return value;
      }
      throw new Error(`append target must be a array`);
    })
  ]
]);

function executeAdd(ast: AST, context: Context): Value {
  const left = executeAST(ast.param2, context) as any;
  const right = executeAST(ast.param3!, context) as any;
  return left + right;
}
function executeSub(ast: AST, context: Context): Value {
  const left = executeAST(ast.param2!, context) as any;
  const right = executeAST(ast.param3!, context) as any;
  return left - right;
}
function executeMultiply(ast: AST, context: Context): Value {
  const left = executeAST(ast.param2!, context) as any;
  const right = executeAST(ast.param3!, context) as any;
  return left * right;
}
function executeDivision(ast: AST, context: Context): Value {
  const left = executeAST(ast.param2!, context) as any;
  const right = executeAST(ast.param3!, context) as any;
  return left / right;
}
function executeFunctionParam(
  ast: AST | null,
  context: Context,
  arr: Value[] = []
): Value[] {
  if (!ast) {
    return arr;
  }
  const currentValue = executeAST(ast.param2!, context);
  arr.push(currentValue);
  executeFunctionParam(ast.param3!, context, arr);
  return arr;
}
function executeFunctionCall(ast: AST, context: Context) {
  const identity = ast.param2! as string;
  const params = executeFunctionParam(ast.param3!, context);
  if (InternalFunctionMap.has(identity)) {
    return InternalFunctionMap.get(identity)!.call(params);
  }
  const [func] = context.searchInContext(identity);

  if (func instanceof FunctionExecutor) {
    return func.call(params);
  } else {
    throw new Error(`${identity} can't to call`);
  }
}
function resolveFunctionParams(
  ast: AST | null | undefined,
  arr: string[] = []
): string[] {
  if (!ast) {
    return arr;
  }
  arr.push(ast.param2!);
  resolveFunctionParams(ast.param3, arr);
  return arr;
}
function executeString(ast: AST): Value {
  return ast.param2 as string;
}
function executeNumber(ast: AST): Value {
  return ast.param2 as number;
}
function executeBool(ast: AST): Value {
  return ast.param2 as boolean;
}
function executeArrayList(
  ast: AST,
  context: Context,
  arr: Value[] = []
): Value[] {
  if (!ast) {
    return arr;
  }
  const value = executeAST(ast.param2!, context);
  arr.push(value);
  executeArrayList(ast.param3!, context, arr);
  return arr;
}
function executeArray(ast: AST, context: Context): Value {
  return executeArrayList(ast.param2, context);
}
function executeDeclare(ast: AST, context: Context): Value {
  context.declareParam(ast.param2!, null);
  return null;
}
function executeDeclareInitial(ast: AST, context: Context): Value {
  const value = executeAST(ast.param3!, context);
  context.declareParam(ast.param2!, value);
  return value;
}
function executeSetValue(ast: AST, context: Context): Value {
  const name = ast.param2 as string;
  const value = executeAST(ast.param3!, context);
  context.setValue(name, value);
  return value;
}
function executeIdentify(ast: AST, context: Context): Value {
  const name = ast.param2 as string;
  return context.searchInContext(name)[0];
}
function executeDeclareFunction(ast: AST, context: Context): Value {
  const name = ast.param2 as string;
  const params = resolveFunctionParams(ast.param3);
  const func = new DynamicFunctionExecutor(
    ast.param4,
    params,
    context.makeChild()
  );
  context.declareParam(name, func);
  return func;
}
function executeEqual(ast: AST, context: Context): Value {
  const left = executeAST(ast.param2!, context);
  const right = executeAST(ast.param3!, context);
  return left === right;
}
function executeNotEqual(ast: AST, context: Context): Value {
  const left = executeAST(ast.param2!, context);
  const right = executeAST(ast.param3!, context);
  return left !== right;
}
function executeGreatThan(ast: AST, context: Context): Value {
  const left = executeAST(ast.param2!, context) as any;
  const right = executeAST(ast.param3!, context) as any;
  return left > right;
}
function executeLessThan(ast: AST, context: Context): Value {
  const left = executeAST(ast.param2!, context) as any;
  const right = executeAST(ast.param3!, context) as any;
  return left < right;
}
function executeGreatThanOrEqual(ast: AST, context: Context): Value {
  const left = executeAST(ast.param2!, context) as any;
  const right = executeAST(ast.param3!, context) as any;
  return left >= right;
}
function executeLessThanOrEqual(ast: AST, context: Context): Value {
  const left = executeAST(ast.param2!, context) as any;
  const right = executeAST(ast.param3!, context) as any;
  return left <= right;
}
function executeAddAndAssign(ast: AST, context: Context): Value {
  const name = ast.param2 as string;
  const [value, ctx] = context.searchInContext(name);
  const rightValue = executeAST(ast.param3!, context) as any;
  const res = value + rightValue;
  ctx.setValue(name, res);
  return res;
}
function executeSubAndAssign(ast: AST, context: Context): Value {
  const name = ast.param2 as string;
  const [value, ctx] = context.searchInContext(name);
  const rightValue = executeAST(ast.param3!, context) as any;
  const res = (value as any) - rightValue;
  ctx.setValue(name, res);
  return res;
}
function executeSMulAndAssign(ast: AST, context: Context): Value {
  const name = ast.param2 as string;
  const [value, ctx] = context.searchInContext(name);
  const rightValue = executeAST(ast.param3!, context) as any;
  const res = (value as any) * rightValue;
  ctx.setValue(name, res);
  return res;
}
function executeDivAndAssign(ast: AST, context: Context): Value {
  const name = ast.param2 as string;
  const [value, ctx] = context.searchInContext(name);
  const rightValue = executeAST(ast.param3!, context) as any;
  const res = (value as any) / rightValue;
  ctx.setValue(name, res);
  return res;
}
function executeIf(ast: AST, context: Context): Value {
  const condition = executeAST(ast.param2!, context);
  const childContext = context.makeChild();
  if (condition) {
    if (ast.param3) {
      executeAST(ast.param3, childContext);

      if (childContext.exit !== undefined) {
        context.exit = childContext.exit;
      }
    }
  } else {
    if (ast.param4) {
      executeAST(ast.param4, childContext);
    }
  }
  // 如果子上下文return了，根据流程控制if应该传递return状态
  if (childContext.exit !== undefined) {
    context.exit = childContext.exit;
  }
  if (childContext.break !== undefined) {
    context.break = childContext.break;
  }
  if (childContext.continue !== undefined) {
    context.continue = childContext.continue;
  }
  return null;
}
function executeWhile(ast: AST, context: Context): Value {
  const childContext = context.makeChild();
  while (true) {
    const condition = executeAST(ast.param2!, context);
    if (!condition) break;
    if (ast.param3) {
      executeAST(ast.param3, childContext);
    }
    // 如果子上下文return了，根据流程控制while应该传递return状态
    if (childContext.exit !== undefined) {
      context.exit = childContext.exit;
      return null;
    }
    if (childContext.break !== undefined) {
      console.log("break");
      childContext.break = undefined;
      return null;
    }
    if (childContext.continue !== undefined) {
      childContext.continue = undefined;
    }
  }
  return null;
}
function executeReturn(ast: AST, context: Context): Value {
  if (!ast.param2) {
    context.exit = null;
    return null;
  }
  const res = executeAST(ast.param2!, context);
  context.exit = res;
  return res;
}
function executeBreak(ast: AST, context: Context): Value {
  if (!ast.param2) {
    context.break = null;
    return null;
  }
  const res = executeAST(ast.param2!, context);
  context.break = res;
  return res;
}
function executeContinue(ast: AST, context: Context): Value {
  if (!ast.param2) {
    context.continue = null;
    return null;
  }
  const res = executeAST(ast.param2!, context);
  context.continue = res;
  return res;
}
function executeArrayGet(ast: AST, context: Context) {
  const name = ast.param2 as string;
  const idx = executeAST(ast.param3!, context);
  const [value] = context.searchInContext(name);
  if (typeof value !== "object") {
    throw new Error(`the ${name} can't use array get`);
  }
  return ((value as any)[idx as any] ?? null) as Value;
}
function executeNegative(ast: AST, context: Context): Value {
  const value = executeAST(ast.param2!, context);
  return !value;
}

function executePoint(ast: AST, context: Context): Value {
  const left = executeAST(ast.param2, context) as any;
  const right = ast.param3!.param2 as string;
  if (!left) {
    throw new Error(`left value is empty`);
  }
  if (!right) {
    throw new Error(`right value is empty`);
  }
  return wrapperValue(left[right]);
}
function executeSetArrayValue(ast:AST,context:Context):Value {
  const name = ast.param2 as string;
  const [target] = context.searchInContext(name);
  if(!target) {
    throw new Error(`can't set value in to null`);
  }
  const index = executeAST(ast.param3!,context) as string|number;
  const value = executeAST(ast.param4!,context);
  if(target instanceof Map) {
    target.set(String(index),value);
    return value;
  }
  if(target instanceof Array) {
    target[Number(index)] = value
    return value;
  }
  if(target instanceof Object) {
    (target as any)[index] = value;
    return value;
  }
  throw new Error(`target can't set value`);

}
export function executeAST(ast: AST, context: Context): Value {
  if (context.NormalExit !== undefined) {
    return context.NormalExit;
  }
  switch (ast.param1) {
    case "+":
      return executeAdd(ast, context);
    case "-":
      return executeSub(ast, context);
    case "*":
      return executeMultiply(ast, context);
    case "/":
      return executeDivision(ast, context);
    case "!":
      return executeNegative(ast, context);
    case ".":
      return executePoint(ast, context);
    case "==":
      return executeEqual(ast, context);
    case "!=":
      return executeNotEqual(ast, context);
    case ">":
      return executeGreatThan(ast, context);
    case "<":
      return executeLessThan(ast, context);
    case ">=":
      return executeGreatThanOrEqual(ast, context);
    case "<=":
      return executeLessThanOrEqual(ast, context);
    case "+=":
      return executeAddAndAssign(ast, context);
    case "-=":
      return executeSubAndAssign(ast, context);
    case "*=":
      return executeSMulAndAssign(ast, context);
    case "/=":
      return executeDivAndAssign(ast, context);
    case "STRING":
      return executeString(ast);
    case "NUMBER":
      return executeNumber(ast);
    case "BOOL":
      return executeBool(ast);
    case "ARRAY":
      return executeArray(ast, context);
    case "ARRAY_GET":
      return executeArrayGet(ast, context);
    case "NULL":
      return null;
    case "IDENTIFY":
      return executeIdentify(ast, context);
    case "IF":
      return executeIf(ast, context);
    case "WHILE":
      return executeWhile(ast, context);
    case "DECLARE_VAR":
      return executeDeclare(ast, context);
    case "DECLARE_VAR_INITIAL":
      return executeDeclareInitial(ast, context);
    case "SET_VALUE":
      return executeSetValue(ast, context);
    case "SET_ARRAY_VALUE":
      return executeSetArrayValue(ast,context);
    case "FUNCTION_CALL":
      return executeFunctionCall(ast, context);
    case "FUNCTION_DECLARE":
      return executeDeclareFunction(ast, context);
    case "RETURN":
      return executeReturn(ast, context);
    case "BREAK":
      return executeBreak(ast, context);
    case "CONTINUE":
      return executeContinue(ast, context);
    case "EXPRESSION_SEQ":
      executeAST(ast.param2!, context);
      if (context.NormalExit !== undefined) {
        return context.NormalExit;
      }
      return executeAST(ast.param3!, context);
    default:
      return null;
  }
}
export function evalAST(ast: AST, context?: Context) {
  const ctx = context ?? new Context();
}
