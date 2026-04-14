import { registerTask } from '../taskRegistry';
import { createBuildTaskDefinition, listBuildingDefinitions } from '../../buildings/registry';
import { createUpgradeTaskDefinition, listUpgradeDefinitions } from '../../buildings/upgrades';

for (const building of listBuildingDefinitions()) {
    registerTask(createBuildTaskDefinition(building));
}

for (const upgrade of listUpgradeDefinitions()) {
    registerTask(createUpgradeTaskDefinition(upgrade));
}
