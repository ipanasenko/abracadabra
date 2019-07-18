import * as vscode from "vscode";

import { createCommand } from "../../commands";
import { addBracesToArrowFunction } from "./add-braces-to-arrow-function";

// Must match `command` field in `package.json`
export const commandKey = "abracadabra.addBracesToArrowFunction";

export default vscode.commands.registerCommand(
  commandKey,
  createCommand(addBracesToArrowFunction)
);
