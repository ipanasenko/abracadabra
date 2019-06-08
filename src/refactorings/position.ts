import { ASTPosition } from "./ast";

export { Position };

class Position {
  private _line: number;
  private _character: number;

  constructor(line: number, character: number) {
    this._line = line;
    this._character = character;
  }

  static fromAST(astPosition: ASTPosition): Position {
    return new Position(astPosition.line - 1, astPosition.column);
  }

  get line(): number {
    return this._line;
  }

  get character(): number {
    return this._character;
  }

  isEqualTo(position: Position): boolean {
    return (
      this.isSameLineThan(position) && this.character === position.character
    );
  }

  isSameLineThan(position: Position): boolean {
    return this.line === position.line;
  }

  isBefore(position: Position): boolean {
    return (
      this.isEqualTo(position) ||
      this.line < position.line ||
      (this.isSameLineThan(position) && this.character < position.character)
    );
  }

  isAfter(position: Position): boolean {
    return this.isEqualTo(position) || !this.isBefore(position);
  }

  putAtStartOfLine(): Position {
    return new Position(this.line, 0);
  }

  putAtNextLine(): Position {
    return new Position(this.line + 1, this.character);
  }
}
