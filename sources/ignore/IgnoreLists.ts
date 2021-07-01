import mm from "micromatch";
import {Workspace} from "@yarnpkg/core";
import getGlobalIgnoreList from "./getGlobalIgnoreList";
import getIgnoreList from "./getIgnoreList";
import {IgnoreList} from "./types";

export default class IgnoreLists {
    private ignoreList: IgnoreList;
    private globalList: IgnoreList;

    constructor(ignoreList: IgnoreList, globalList: IgnoreList) {
        this.ignoreList = ignoreList;
        this.globalList = globalList;
    }

    static async for(workspace: Workspace) {
        const globalList = getGlobalIgnoreList(workspace);
        const ignoreList = await getIgnoreList(workspace);

        return new IgnoreLists(ignoreList, globalList);
    }

    private isMatch(path: string, patterns: Array<string>) {
        let inclusives = patterns;
        const exclusives = [];

        for (let t = 0; t < patterns.length; ++t) {
            if (patterns[t][0] !== `!`) {
                if (inclusives !== patterns) {
                    inclusives.push(patterns[t]);
                }
            } else {
                if (inclusives === patterns)
                    inclusives = patterns.slice(0, t);

                exclusives.push(patterns[t].slice(1));
            }
        }

        if (this.isMatchBasename(path, exclusives))
            return false;
        if (this.isMatchBasename(path, inclusives))
            return true;

        return false;
    }

    private isMatchBasename(path: string, patterns: Array<string>) {
        let paths = patterns;
        const basenames = [];

        for (let t = 0; t < patterns.length; ++t) {
            if (patterns[t].includes(`/`)) {
                if (paths !== patterns) {
                    paths.push(patterns[t]);
                }
            } else {
                if (paths === patterns)
                    paths = patterns.slice(0, t);

                basenames.push(patterns[t]);
            }
        }

        if (mm.isMatch(path, paths as any, {dot: true, nocase: true}))
            return true;
        if (mm.isMatch(path, basenames as any, {dot: true, basename: true, nocase: true}))
            return true;

        return false;
    }

    isIgnored(cwd: string): boolean {
        if (this.isMatch(cwd, this.globalList.accept))
            return false;
        if (this.isMatch(cwd, this.globalList.reject))
            return true;

        if (this.isMatch(cwd, this.ignoreList.accept))
            return false;
        if (this.isMatch(cwd, this.ignoreList.reject)) {
            return true;
        }

        return false;
    }
}