%lex

%s comma_single comma_multiply

%%
\/\/                  %{ this.begin('comma_single') %}
<comma_single>(\r\n|\n)   %{ this.popState();%}
<comma_single>.         /* skip */
\/\*                  %{ this.begin('comma_multiply') %}
<comma_multiply>\*\/  %{ this.popState(); %}
<comma_multiply>.      /* skip */
\s+ /* skip whitespace */
[0-9]+("."[0-9]+)?\b   return 'NUMBER'  // 捕获数字
\".*?\"    return 'STRING' // 捕获字符串
\'.*?\'    return 'STRING'
"if"       return 'IF'
"else"     return 'ELSE'
"while"    return 'WHILE'
"let"      return 'LET'
"func"     return 'FUNC'
"true"     return 'BOOL'
"false"    return 'BOOL'
"null"     return 'NULL'
"return"   return 'RETURN'
"break"    return 'BREAK'
"continue" return 'CONTINUE'
"=="       return '=='
"+="       return '+='
"-="       return '-='
"*="       return '*='
"/="       return '/='
"!="       return '!='
">="       return '>='
"<="       return '<='
[a-z_A-Z][a-zA-Z]* return 'IDENTIFY' //捕获标识符
"*"        return '*'
"/"        return '/'
"+"        return '+'
"-"        return '-'
"^"        return '^'
">"        return '>'
"<"        return '<'
"!"        return '!'
"%"        return '%'
"("        return '('
")"        return ')'
"["        return '['
"]"        return ']'
"{"        return '{'
"}"        return '}'
";"        return ';'
"="        return '='
","        return ','
"."        return '.'
<<EOF>>    return 'EOF'
.          return 'INVALID'  

/lex

/* operator associations and percedence */
%left 'IDENTIFY'
%left '==' '!=' '>=' '<='
%left '+=' '-='
%left '*=' '/='
%left '='
%left '>' '<'
%left '+' '-'
%left '*' '/'
%left '[' ']'
%left '(' ')'
%left '^' '.'
%right '!'
%right '%'
%left UMINUS

%start expressions


%% /* language grammar */
// 主表达式
expressions
    // 一个主表达式由一个子表达式和EOF构成
    : sub_expression EOF {
        return $1;
    }
    ;
// 子表达式
// 子表达式可以由 (普通表达式|块表达式) 子表达式* 构成
sub_expression
    : normal_expression
    {
        $$ = $1;
    }
    | normal_expression sub_expression 
    {
        $$ = new AST('EXPRESSION_SEQ',$1,$2);
    }
    | block_expression
    {
        $$ = $1;
    }
    | block_expression sub_expression
    {
        $$ = new AST('EXPRESSION_SEQ',$1,$2);
    }
    ;
// 块表达式，不能进行内联求值的统一归类为块表达式
block_expression
    : while_expression // 循环表达式
    {
        $$ = $1;
    }
    | if_expression // 分支表达式
    {
        $$ = $1;
    }
    | function_expression // 函数声明表达式
    {
        $$ = $1;
    }
    ;
// 普通表达式
// 普通表达式多为单行表达式
normal_expression
    : declare_expression ';' // 声明表达式
    {
        $$ = $1;
    }
    | assign_expression ';' // 赋值表达式
    {
        $$ = $1;
    }
    | value_expression ';' // 求值表达式
    {
        $$ = $1;
    }
    | return_expression  // 返回表达式
    {
        $$ = $1;
    }
    | break_expression // 跳出表达式
    {
        $$ = $1;
    }
    | continue_expression // 继续表达式
    {
        $$ = $1;
    }
    ;

return_expression
    : RETURN normal_expression
    {
        $$ = new AST('RETURN',$2);
    }
    | RETURN ';'
    {
        $$ = new AST('RETURN');
    }
    ;
break_expression
    : BREAK normal_expression
    {
        $$ = new AST('BREAK',$2);
    }
    | BREAK ';'
    {
        $$ = new AST('BREAK');
    }
    ;
continue_expression
    : CONTINUE normal_expression
    {
        $$ = new AST('CONTINUE',$2);
    }
    | CONTINUE ';'
    {
        $$ = new AST('CONTINUE');
    }
    ;
assign_expression
    : IDENTIFY '=' value_expression
    {
        $$ = new AST('SET_VALUE',$1,$3);
    }
    | IDENTIFY '[' value_expression ']' '=' value_expression 
    {
        $$ = new AST('SET_ARRAY_VALUE',$1,$3,$6);
    }
    ;
if_expression
    : IF '(' value_expression ')' '{' sub_expression '}'
    {
        $$ = new AST('IF',$3,$6);
    }
    | IF '(' value_expression ')' '{'  '}'
    {
        $$ = new AST('IF',$3,null);
    }
    | IF '(' value_expression ')'
    {
        $$ = new AST('IF',$3,null);
    }
    | IF '(' value_expression ')' '{' sub_expression '}' ELSE '{' sub_expression '}' {
        $$ = new AST('IF',$3,$6,$10);
    }
    ;
while_expression
    : WHILE '(' value_expression ')' '{' sub_expression '}'
    {
        $$ = new AST('WHILE',$3,$6);
    }
    | WHILE '(' value_expression ')' '{'  '}'
    {
        $$ = new AST('WHILE',$3,null);
    }
    | WHILE '(' value_expression ')'
    {
        $$ = new AST('WHILE',$3,null);
    }
    ;

// 声明表达式
declare_expression
    : 'LET' 'IDENTIFY' // 普通变量声明
    {
        $$ = new AST('DECLARE_VAR',$2);
    }
    | 'LET' 'IDENTIFY' '=' value_expression  // 普通变量声明并使用值表达式初始化
    {
        $$ = new AST('DECLARE_VAR_INITIAL',$2,$4);
    }
    ;
// 函数表达式
function_expression
    : 'FUNC' IDENTIFY '(' function_param_list ')' '{' sub_expression '}'
    {
        $$ = new AST('FUNCTION_DECLARE',$2,$4,$7);
    }
    | 'FUNC' IDENTIFY '(' ')' '{' sub_expression '}'
    {
        $$ = new AST('FUNCTION_DECLARE',$2,null,$6);
    }
    | 'FUNC' IDENTIFY '(' ')' '{'  '}'
    {
        $$ = new AST('FUNCTION_DECLARE',$2,null,null);
    }
    ;

// 值表达式，此表达式最终会求出值
value_expression
    : value_expression '+' value_expression 
    {
        $$ = new AST($2,$1,$3);
    }
    | value_expression '-' value_expression
    {
        $$ = new AST($2,$1,$3);
    }
    | value_expression '*' value_expression 
    {
        $$ = new AST($2,$1,$3);
    }
    | value_expression '/' value_expression
    {
        $$ = new AST($2,$1,$3);
    }
    | value_expression '==' value_expression 
    {
        $$ = new AST($2,$1,$3);
    }
    | value_expression '!=' value_expression
    {
        $$ = new AST($2,$1,$3);
    }
    | value_expression '>' value_expression
    {
        $$ = new AST($2,$1,$3);
    }
    | value_expression '<' value_expression
    {
        $$ = new AST($2,$1,$3);
    }
    | value_expression '>=' value_expression
    {
        $$ = new AST($2,$1,$3);
    }
    | value_expression '<=' value_expression
    {
        $$ = new AST($2,$1,$3);
    }
    | IDENTIFY '+=' value_expression
    {
        $$ = new AST($2,$1,$3);
    }
    | IDENTIFY '-=' value_expression
    {
        $$ = new AST($2,$1,$3);
    }
    | IDENTIFY '*=' value_expression
    {
        $$ = new AST($2,$1,$3);
    }
    | IDENTIFY '/=' value_expression
    {
        $$ = new AST($2,$1,$3);
    }
    | value_expression '.' IDENTIFY
    {
        $$ = new AST($2,$1,$3);
    }
    | '!' value_expression 
    {
        $$ = new AST($1,$2);
    }
    | '(' value_expression ')'
    {
        $$ = $2;
    }
    | '[' ']'
    {
        $$ = new AST('ARRAY',null);
    }
    | '[' array_list ']'
    {
        $$ = new AST('ARRAY',$2);
    }
    | NUMBER
    {
        $$ = new AST('NUMBER',Number($1))
    }
    | STRING 
    {
        $$ = new AST('STRING',parseString($1));
    }
    | BOOL
    {
        $$ = new AST('BOOL',parseBool($1));
    }
    | NULL
    {
        $$ = new AST('NULL');
    }
    | IDENTIFY
    {
        $$ = new AST('IDENTIFY',$1);
    }
    | function_call_expression // 调用函数求值
    {
        $$ = $1;
    }
    | array_get_expression
    {
        $$ = $1;
    }
    ;
array_get_expression
    : IDENTIFY '[' value_expression ']'
    {
        $$ = new AST('ARRAY_GET',$1,$3);
    }
    ;
function_call_expression
    : IDENTIFY '(' function_call_param_list ')'
    {
        $$ = new AST('FUNCTION_CALL',$1,$3);
    }
    | IDENTIFY '(' ')'
    {
        $$ = new AST('FUNCTION_CALL',$1,null);
    }
    ;
function_call_param_list
    : paramable_expression
    {
        $$ = new AST('CALL_PARAM_LIST',$1);
    }
    | paramable_expression ',' function_call_param_list
    {
        $$ = new AST('CALL_PARAM_LIST',$1,$3);
    }
    ;
paramable_expression
    : value_expression
    {
        $$ = $1;
    }
    | function_expression
    {
        $$ = $1;
    }
    ;
function_param_list
    : IDENTIFY
    {
        $$ = new AST('PARAM_LIST',$1);
    }
    | IDENTIFY ',' function_param_list
    {
        $$ = new AST('PARAM_LIST',$1,$3);
    }
    ;
array_list
    : value_expression
    {
        $$ = new AST('ARRAY_VALUE_LIST',$1);
    }
    | value_expression ',' array_list
    {
        $$ = new AST('ARRAY_VALUE_LIST',$1,$3);
    }
    ;
%%
function parseString(str) {
    return str.substr(1,str.length-2);
}
function parseBool(str) {
    return str === 'true'
}
class AST {
    constructor(param1,param2,param3,param4) {
        this.param1 = param1;
        this.param2 = param2;
        this.param3 = param3;
        this.param4 = param4;
    }
}