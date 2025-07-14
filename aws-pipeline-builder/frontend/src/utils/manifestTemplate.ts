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
      manifest = manifest.replace(/\{\{\s*pipeline_name\s*\}\}/g, config.serviceName || pipelineName);
      manifest = manifest.replace(/\{\{\s*namespace\s*\}\}/g, config.namespace);
      manifest = manifest.replace(/\{\{\s*app_type\s*\}\}/g, config.appType);
      manifest = manifest.replace(/\{\{\s*product\s*\}\}/g, config.product);
      manifest = manifest.replace(/\{\{\s*image\s*\}\}/g, `${ecrUri}:latest`);
      manifest = manifest.replace(/\{\{\s*memory_limit\s*\}\}/g, config.memoryLimit);
      manifest = manifest.replace(/\{\{\s*cpu_limit\s*\}\}/g, config.cpuLimit);
      manifest = manifest.replace(/\{\{\s*memory_request\s*\}\}/g, config.memoryRequest);
      manifest = manifest.replace(/\{\{\s*cpu_request\s*\}\}/g, config.cpuRequest);
      manifest = manifest.replace(/\{\{\s*node_group\s*\}\}/g, config.nodeGroup);
      manifest = manifest.replace(/\{\{\s*target_port\s*\}\}/g, String(config.targetPort || 80));
      manifest = manifest.replace(/\{\{\s*service_type\s*\}\}/g, config.serviceType || 'ClusterIP');
      
      // Handle node affinity section conditionally
      let nodeAffinitySection = '';
      if (config.useSpecificNodeGroup) {
        nodeAffinitySection = `      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: ${config.nodeGroup}
                    operator: In
                    values:
                      - "true"
      tolerations:
        - key: ${config.nodeGroup}
          operator: Equal
          value: "true"
          effect: NoSchedule`;
      }
      manifest = manifest.replace(/\{\{\s*node_affinity_section\s*\}\}/g, nodeAffinitySection);
      
      // Handle service account replacement
      if (config.useServiceAccount && config.serviceAccountName) {
        // Replace the service_account variable with the provided value
        manifest = manifest.replace(/\{\{\s*service_account\s*\}\}/g, config.serviceAccountName);
      } else if (!config.useServiceAccount) {
        // Remove the entire serviceAccountName line while preserving indentation
        // This regex captures the line with its indentation and removes only that line
        // Updated regex to handle cases where there might not be a trailing newline
        manifest = manifest.replace(/^\s*serviceAccountName:\s*\{\{\s*service_account\s*\}\}.*\n?/gm, '');
      } else {
        // If useServiceAccount is true but no name provided, use default
        manifest = manifest.replace(/\{\{\s*service_account\s*\}\}/g, 'default');
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


export const generateServiceManifest = async (
  pipelineName: string,
  config: DeploymentConfig
): Promise<string> => {
  try {
    // Fetch the service template from backend
    const response = await axios.get(getApiUrl('/api/service-template'));
    if (response.data.success && response.data.template) {
      // Replace template variables with actual values
      let manifest = response.data.template;
      
      // Replace all template variables
      manifest = manifest.replace(/\{\{\s*pipeline_name\s*\}\}/g, config.serviceName || pipelineName);
      manifest = manifest.replace(/\{\{\s*namespace\s*\}\}/g, config.namespace);
      manifest = manifest.replace(/\{\{\s*app_type\s*\}\}/g, config.appType);
      manifest = manifest.replace(/\{\{\s*product\s*\}\}/g, config.product);
      manifest = manifest.replace(/\{\{\s*service_port\s*\}\}/g, String(config.targetPort || 80));
      manifest = manifest.replace(/\{\{\s*target_port\s*\}\}/g, String(config.targetPort || 80));
      manifest = manifest.replace(/\{\{\s*service_type\s*\}\}/g, config.serviceType || 'ClusterIP');
      
      return manifest;
    }
  } catch (error) {
    console.error('Failed to generate service manifest:', error);
  }
  
  // Fallback to default service manifest
  return `apiVersion: v1
kind: Service
metadata:
  name: ${config.serviceName || pipelineName}-service
  namespace: ${config.namespace}
  labels:
    app.type: "${config.appType}"
    product: "${config.product}"
spec:
  selector:
    app.kubernetes.io/name: ${config.serviceName || pipelineName}
  ports:
  - name: http
    port: ${config.targetPort || 80}
    targetPort: ${config.targetPort || 80}
    protocol: TCP
  type: ${config.serviceType || 'ClusterIP'}`;
};

export const getDefaultDeploymentConfig = (): DeploymentConfig => ({
  namespace: 'staging-locobuzz',
  serviceName: '',
  appType: 'csharp',
  product: 'cmo',
  memoryLimit: '300Mi',
  cpuLimit: '300m',
  memoryRequest: '150Mi',
  cpuRequest: '150m',
  nodeGroup: 'cmo-nodegroup',
  targetPort: 80,
  serviceType: 'ClusterIP'
});