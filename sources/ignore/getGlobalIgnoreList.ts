import {Workspace} from "@yarnpkg/core";
import {IgnoreList} from "./types";
import {ppath} from "@yarnpkg/fslib";

const ALWAYS_IGNORE = [
    `/package.tgz`,

    `.github`,
    `.git`,
    `.hg`,
    `node_modules`,

    `.npmignore`,
    `.gitignore`,

    `.#*`,
    `.DS_Store`,

    `.yarn`,
];

export default function getGlobalIgnoreList(workspace: Workspace) {
    const project = workspace.project;

    const globalList: IgnoreList = {
        accept: [],
        reject: [],
    };

    for (const pattern of ALWAYS_IGNORE)
        globalList.reject.push(pattern);


    // All child workspaces are ignored
    for (const otherWorkspace of project.workspaces) {
        const rel = ppath.relative(workspace.cwd, otherWorkspace.cwd);
        if (rel !== `` && !rel.match(/^(\.\.)?\//)) {
            globalList.reject.push(`/${rel}`);
        }
    }

    return globalList;
}
