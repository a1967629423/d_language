import { Parser } from "./d_language_lib";
import { readFile } from "fs/promises";
import {Context, executeAST} from './executor'

async function main() {
  const testCode = (await readFile("test.dl")).toString("utf-8");
  //console.log(`输入的code:\n${testCode}`);
  const parser = new Parser();

  const ast = parser.parse(testCode);
  const res = executeAST(ast,new Context());
  console.log('execute Result:',res);
}

main();
