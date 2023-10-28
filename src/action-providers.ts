import { minimatch } from "minimatch";
import * as vscode from "vscode";

import * as t from "./ast";
import { createVSCodeEditor } from "./editor/adapters/create-vscode-editor";
import { Editor } from "./editor/editor";
import { ConsoleLogger, TypeChecker } from "./type-checker";
import { RefactoringWithActionProvider } from "./types";
import {
  getIgnoredFolders,
  getIgnoredPatterns,
  getMaxFileLinesCount,
  shouldShowInQuickFix
} from "./vscode-configuration";

type Refactoring = RefactoringWithActionProvider;

export class RefactoringActionProvider implements vscode.CodeActionProvider {
  constructor(private refactorings: Refactoring[]) {}

  async provideCodeActions(document: vscode.TextDocument) {
    const NO_ACTION: vscode.CodeAction[] = [];

    if (await this.isNavigatingAnIgnoredFile(document.uri.path)) {
      return NO_ACTION;
    }

    const editor = createVSCodeEditor();
    if (!editor) return NO_ACTION;

    try {
      return this.findApplicableRefactorings(editor).map((refactoring) =>
        this.buildCodeActionFor(refactoring)
      );
    } catch {
      // Silently fail, we don't care why it failed (e.g. code can't be parsed).
      return NO_ACTION;
    }
  }

  private async isNavigatingAnIgnoredFile(filePath: string) {
    const relativeFilePath = vscode.workspace.asRelativePath(filePath);
    const isFolderIgnored = getIgnoredFolders().some((ignored) =>
      relativeFilePath.includes(`/${ignored}/`)
    );
    const isPatternIgnored = getIgnoredPatterns().some((ignored) =>
      minimatch(relativeFilePath, ignored)
    );
    const fileContent = await vscode.workspace.fs.readFile(
      vscode.Uri.file(filePath)
    );
    const fileLength = new TextDecoder("utf8")
      .decode(fileContent)
      .split("\n").length;
    const isTooLarge = fileLength > getMaxFileLinesCount();
    return isFolderIgnored || isPatternIgnored || isTooLarge;
  }

  private findApplicableRefactorings({
    code,
    selection
  }: Editor): Refactoring[] {
    const applicableRefactorings = new Map<string, Refactoring>();

    const refactoringsToCheck = this.refactorings.filter(
      ({ command: { key } }) => shouldShowInQuickFix(key)
    );

    t.traverseAST(t.parse(code), {
      enter: (path) => {
        /**
         * Hint for perf improvement
         * =========================
         *
         * It seems we're trying each refactoring on each Node of the AST.
         * We could filter nodes for which selection isn't inside!
         */
        refactoringsToCheck.forEach((refactoring) => {
          const {
            actionProvider,
            command: { key }
          } = refactoring;

          const visitor = actionProvider.createVisitor(
            selection,
            (visitedPath) => {
              if (actionProvider.updateMessage) {
                actionProvider.message =
                  actionProvider.updateMessage(visitedPath);
              }

              applicableRefactorings.set(key, refactoring);
            },
            new TypeChecker(code, new ConsoleLogger())
          );

          this.visit(visitor, path);
        });
      }
    });

    return Array.from(applicableRefactorings.values());
  }

  private visit(visitor: t.Visitor, path: t.NodePath) {
    if (typeof visitor.enter === "function") {
      visitor.enter(path, path.state);
    }

    const visitorNode = this.getVisitorNode(visitor, path);
    // call enter shorthand of e.g. { Identifier() { ... } }
    if (typeof visitorNode === "function") {
      // @ts-expect-error visitor can expect `NodePath<File>` but `path` is typed as `NodePath<Node>`. It should be OK at runtime.
      visitorNode.bind(visitor)(path, path.state);
    } else if (typeof visitorNode === "object" && visitorNode !== null) {
      // call methods of e.g. { Identifier: { exit() { ... } } }
      for (const method of Object.values(visitorNode)) {
        if (typeof method === "function") {
          method.bind(visitor)(path, path.state);
        }
      }
    }
  }

  private getVisitorNode(visitor: t.Visitor, path: t.NodePath) {
    const nodeType = path.node.type;

    if (visitor[nodeType]) {
      return visitor[nodeType];
    }

    const visitorTypes = Object.keys(visitor) as (keyof t.Visitor)[];
    const matchingType = visitorTypes.find((type) => t.isType(nodeType, type));
    return matchingType ? visitor[matchingType] : null;
  }

  private buildCodeActionFor(refactoring: Refactoring) {
    const action = new vscode.CodeAction(
      `${refactoring.actionProvider.message} ✨`,
      vscode.CodeActionKind.RefactorRewrite
    );

    action.isPreferred = refactoring.actionProvider.isPreferred;
    action.command = {
      command: `abracadabra.${refactoring.command.key}`,
      title: refactoring.command.title
    };

    return action;
  }
}
