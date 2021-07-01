import {
    Workspace
} from "@yarnpkg/core";
import {
    JailFS,
    PortablePath,
    ppath,
} from "@yarnpkg/fslib";
import IgnoreLists from "./ignore/IgnoreLists";

async function walk(dir: PortablePath, ignoreLists: IgnoreLists) {
    const list: Array<PortablePath> = [];

    const cwdFs = new JailFS(dir);
    const cwdList = [PortablePath.root];

    while (cwdList.length > 0) {
        const cwd = cwdList.pop()!;
        const stat = await cwdFs.lstatPromise(cwd);

        if (ignoreLists.isIgnored(cwd))
            continue;

        if (stat.isDirectory()) {
            const entries = await cwdFs.readdirPromise(cwd);

            for (const entry of entries) {
                cwdList.push(ppath.resolve(cwd, entry));
            }

            for (const entry of entries) {
                cwdList.push(ppath.resolve(cwd, entry));
            }
        } else if (stat.isFile() || stat.isSymbolicLink()) {
            list.push(ppath.relative(PortablePath.root, cwd));
        }
    }

    return list.sort();
}

export default async function getLambdaSrcFiles(src: PortablePath, workspace: Workspace) {
    const ignoreLists = await IgnoreLists.for(workspace);

    return await walk(src, ignoreLists);
}
