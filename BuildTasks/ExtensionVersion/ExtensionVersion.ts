import * as tl from "vsts-task-lib/task";
import * as tr from "vsts-task-lib/toolRunner";
import * as common from "./common";
import * as stream from "stream";
import * as fs from "fs";

try {
    common.AppInsightsClient.trackEvent("Task/QueryVersion");
    const extensionVersionOverrideVariable = tl.getInput("extensionVersionOverride", false);
    const outputVariable = tl.getInput("outputVariable", true);
    let usingOverride = false;

    if (extensionVersionOverrideVariable) {
        tl.debug(`Override variable specified checking for value.`);
        const extensionVersionOverride = tl.getVariable(extensionVersionOverrideVariable);

        if (extensionVersionOverride) {
            tl._writeLine(`Ignoring Marketplace version and using supplied override: ${extensionVersionOverride}.`);
            tl.setVariable(outputVariable, extensionVersionOverride);
            usingOverride = true;
        }
    }

    if (!usingOverride) {
        common.runTfx((tfx) => {
            tfx.arg(["extension", "show", "--json"]);

            common.setTfxMarketplaceArguments(tfx);
            common.validateAndSetTfxManifestArguments(tfx);

            let option: tr.IExecOptions;
            let result: tr.IExecResult;
            let startTime = Date.now();
            try {
                result = tfx.execSync(option);
            }
            finally {
                common.AppInsightsClient.trackDependency("tfx", "extension show", Date.now() - startTime, result.code === 0, "", { "ResultCode": result.code }, null, false);
            }

            if (!result.error && result.code === 0) {
                const json = JSON.parse(result.stdout);
                let version: string = json.versions[0].version;

                const versionAction = tl.getInput("versionAction", false);

                tl._writeLine(`Latest version   : ${version}.`);
                tl._writeLine(`Requested action : ${versionAction}.`);

                if (versionAction !== "None") {
                    let versionparts: number[] = version.split(".").map(v => +v);
                    switch (versionAction) {
                        case "Major":
                            versionparts = [versionparts[0] + 1, 0, 0];
                            break;
                        case "Minor":
                            versionparts = [versionparts[0], versionparts[1] + 1, 0];
                            break;
                        case "Patch":
                            versionparts = [versionparts[0], versionparts[1], versionparts[2] + 1];
                            break;
                    }
                    version = versionparts.join(".");
                    tl._writeLine(`Updated to       : ${version}.`);
                }

                tl.setVariable(outputVariable, version);
            } else {
                tl.error(result.stderr);
                throw (result.error || result.stderr || `tfx exited with error code: ${result.code}`);
            }
        });
    }
    common.AppInsightsClient.trackEvent("Success");
    tl.setResult(tl.TaskResult.Succeeded, "Done");
}
catch (ex) {
    if (ex) {
        common.AppInsightsClient.trackException(ex);
    }
    common.AppInsightsClient.trackEvent("Failed");
    tl.setResult(tl.TaskResult.Failed, `Failed: ${ex}`);
}
finally {
    common.AppInsightsClient.sendPendingData();
    common.AppInsightsClient.config.sessionExpirationMs = 1;
}