import {Workspace} from "@yarnpkg/core";
import {FakeFS, Filename, JailFS, PortablePath, ppath} from "@yarnpkg/fslib";
import {IgnoreList} from "./types";
import {addIgnorePattern} from "./util";


async function loadIgnoreList(fs: FakeFS<PortablePath>, cwd: PortablePath, filename: PortablePath) {
    const rejectList = [];

    const data = await fs.readFilePromise(ppath.join(cwd, filename), `utf8`);

    for (const pattern of data.split(/\n/g))
        addIgnorePattern(rejectList, pattern, {cwd});

    return rejectList;
}

export default async function getIgnoreList(workspace: Workspace) {
    const cwdFs = new JailFS(PortablePath.root);

    const entries = await cwdFs.readdirPromise(workspace.cwd);

    const hasLambdaIgnore = entries.find((entry) => entry === '.lambdaignore') !== undefined;

    const ignoreList: IgnoreList = {
        accept: [],
        reject: [],
    };

    if (hasLambdaIgnore) {
        const rejectList = await loadIgnoreList(cwdFs, workspace.cwd, '.lambdaignore' as Filename);
        ignoreList.reject = [...ignoreList.reject, ...rejectList, '.lambdaignore'];
    }

    return ignoreList;
}
