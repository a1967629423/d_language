


declare class AST {
    public param1:string;
    public param2?:any;
    public param3?:AST;
    public param4?:AST;
}
export declare function parse(input:string):AST;
export declare class Parser {
    parse(str:string):AST;
}