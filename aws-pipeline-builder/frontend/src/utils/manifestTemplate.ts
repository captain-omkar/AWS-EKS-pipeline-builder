import { DeploymentConfig } from '../types/Pipeline';
import axios from 'axios';
import { getApiUrl } from '../config';

export const generateK8sManifest = async (
  pipelineName: string,
  ecrUri: string,
  config: DeploymentConfig
): Promise<string> => {
  try {
    // Fetch the template from backend
    const response = await axios.get(getApiUrl('/api/manifest-template'));
    if (response.data.success && response.data.template) {
      // Replace template variables with actual values
      let manifest = response.data.template;
      
      // Replace all template variables - the exact format from deployment.yml
      manifest = manifest.replace(/\{\{\s*pipeline_name\s*\}\}/g, pipelineName);
      manifest = manifest.replace(/\{\{\s*namespace\s*\}\}/g, config.namespace);
      manifest = manifest.replace(/\{\{\s*app_type\s*\}\}/g, config.appType);
      manifest = manifest.replace(/\{\{\s*product\s*\}\}/g, config.product);
      manifest = manifest.replace(/\{\{\s*image\s*\}\}/g, `${ecrUri}:latest`);
      manifest = manifest.replace(/\{\{\s*memory_limit\s*\}\}/g, config.memoryLimit);
      manifest = manifest.replace(/\{\{\s*cpu_limit\s*\}\}/g, config.cpuLimit);
      manifest = manifest.replace(/\{\{\s*memory_request\s*\}\}/g, config.memoryRequest);
      manifest = manifest.replace(/\{\{\s*cpu_request\s*\}\}/g, config.cpuRequest);
      manifest = manifest.replace(/\{\{\s*node_group\s*\}\}/g, config.nodeGroup);
      
      // Handle service account conditionally
      if (config.useServiceAccount && config.serviceAccountName) {
        // Replace the serviceAccountName line with the provided value
        manifest = manifest.replace(/serviceAccountName: appmesh-comp/g, `serviceAccountName: ${config.serviceAccountName}`);
      } else if (!config.useServiceAccount) {
        // Remove the entire serviceAccountName line while preserving indentation
        // This regex captures the line with its indentation and removes only that line
        manifest = manifest.replace(/^(\s*)serviceAccountName: appmesh-comp\n/gm, '');
      }
      
      return manifest;
    }
    throw new Error('No template received from backend');
  } catch (error) {
    console.error('Failed to fetch manifest template:', error);
    // Return a basic error message instead of fallback
    return `# Error: Failed to load manifest template\n# ${error}`;
  }
};


export const getDefaultDeploymentConfig = (): DeploymentConfig => ({
  namespace: 'staging-locobuzz',
  appType: 'csharp',
  product: 'cmo',
  memoryLimit: '300Mi',
  cpuLimit: '300m',
  memoryRequest: '150Mi',
  cpuRequest: '150m',
  nodeGroup: 'cmo-nodegroup'
});