import { registerTask } from '../taskRegistry';
import { createBuildTaskDefinition, listBuildingDefinitions } from '../../buildings/registry';

for (const building of listBuildingDefinitions()) {
    registerTask(createBuildTaskDefinition(building));
}
