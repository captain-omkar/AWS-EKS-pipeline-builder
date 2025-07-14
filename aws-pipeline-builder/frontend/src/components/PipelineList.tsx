import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getApiUrl } from '../config';

interface LockStatus {
  locked_by: string;
  locked_at: string;
  expires_at: string;
}

interface PipelineMetadata {
  name: string;
  repositoryName: string;
  branchName: string;
  buildspecPath: string;
  useBuildspecFile: boolean;
  computeType: string;
  environmentVariables: Array<{ name: string; value: string }>;
  deploymentConfig?: any;
  scalingConfig?: any;
  pipelineArn?: string;
  resources?: {
    pipeline: string;
    codebuild: string;
    ecrRepository: string;
    appsettingsRepo?: string;
    manifestRepo?: string;
  };
  createdAt: string;
  lastUpdated: string;
  lockStatus?: LockStatus;
}

const PipelineList: React.FC = () => {
  const navigate = useNavigate();
  const [pipelines, setPipelines] = useState<PipelineMetadata[]>([]);
  const [filteredPipelines, setFilteredPipelines] = useState<PipelineMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20); // Show 20 pipelines per page
  
  // Multiple selection for bulk operations
  const [selectedPipelines, setSelectedPipelines] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [userId] = useState(() => {
    // Generate or retrieve user ID for lock management
    let id = localStorage.getItem('userId');
    if (!id) {
      id = `user-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem('userId', id);
    }
    return id;
  });

  useEffect(() => {
    fetchPipelines();
    
    // Auto-sync pipelines on initial load (after a short delay)
    setTimeout(() => {
      autoSyncAllPipelines();
    }, 2000);
    
    // Refresh lock status more frequently (every 3 seconds)
    const lockInterval = setInterval(() => {
      updateLockStatus();
    }, 3000);
    
    // Check for new pipelines and auto-sync less frequently (every 60 seconds)
    const pipelineInterval = setInterval(() => {
      checkForNewPipelines();
      autoSyncAllPipelines(); // Auto-sync periodically
    }, 60000);
    
    return () => {
      clearInterval(lockInterval);
      clearInterval(pipelineInterval);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const checkForNewPipelines = async () => {
    try {
      // Use lightweight summary endpoint
      const summaryResponse = await axios.get(getApiUrl('/api/pipelines/summary'));
      
      if (summaryResponse.data.success) {
        const currentCount = summaryResponse.data.count;
        const currentNames = summaryResponse.data.names;
        
        // Get existing pipeline names
        const existingNames = pipelines.map(p => p.name).sort();
        
        // Check if there are new pipelines or deletions
        const hasChanges = currentCount !== pipelines.length || 
                          JSON.stringify(currentNames) !== JSON.stringify(existingNames);
        
        if (hasChanges) {
          console.log('Pipeline changes detected, refreshing list...');
          // Fetch complete pipeline data including metadata
          await fetchPipelines();
        }
      }
    } catch (error) {
      // Silently ignore errors during polling
    }
  };

  const updateLockStatus = async () => {
    try {
      // Use lightweight endpoint to only fetch lock status
      const lockResponse = await axios.get(getApiUrl('/api/pipelines/lock-status'));
      
      if (lockResponse.data.success) {
        const lockStatuses = lockResponse.data.pipelines;
        
        // Update only the lock status for existing pipelines without re-rendering
        setPipelines(prevPipelines => {
          return prevPipelines.map(pipeline => {
            const lockInfo = lockStatuses.find((p: any) => p.name === pipeline.name);
            if (lockInfo) {
              // Only update if lock status actually changed
              const newLockStatus = lockInfo.lockStatus;
              if (JSON.stringify(pipeline.lockStatus) !== JSON.stringify(newLockStatus)) {
                return {
                  ...pipeline,
                  lockStatus: newLockStatus
                };
              }
            }
            return pipeline;
          });
        });
        
        // Also update filtered pipelines
        setFilteredPipelines(prevFiltered => {
          return prevFiltered.map(pipeline => {
            const lockInfo = lockStatuses.find((p: any) => p.name === pipeline.name);
            if (lockInfo) {
              const newLockStatus = lockInfo.lockStatus;
              if (JSON.stringify(pipeline.lockStatus) !== JSON.stringify(newLockStatus)) {
                return {
                  ...pipeline,
                  lockStatus: newLockStatus
                };
              }
            }
            return pipeline;
          });
        });
      }
    } catch (error) {
      // Silently ignore errors to avoid spamming console during polling
    }
  };

  const fetchPipelines = async () => {
    try {
      setLoading(true);
      setError(null); // Clear any previous errors
      
      // Fetch both metadata and AWS pipelines with lock status
      const [metadataResponse, awsResponse] = await Promise.all([
        axios.get(getApiUrl('/api/pipeline-metadata')),
        axios.get(getApiUrl('/api/pipelines'))
      ]);
      
      if (metadataResponse.data.success && awsResponse.data.success) {
        const metadataPipelines = metadataResponse.data.pipelines || [];
        const awsPipelines = awsResponse.data.pipelines || [];
        
        // Create a map of AWS pipelines with lock status
        const lockStatusMap = new Map();
        awsPipelines.forEach((awsPipeline: any) => {
          if (awsPipeline && awsPipeline.lockStatus) {
            lockStatusMap.set(awsPipeline.name, awsPipeline.lockStatus);
          }
        });
        
        // Add lock status to metadata pipelines
        const pipelinesWithLockStatus = metadataPipelines.map((pipeline: any) => ({
          ...pipeline,
          lockStatus: lockStatusMap.get(pipeline.name) || null
        }));
        
        setPipelines(pipelinesWithLockStatus);
        setFilteredPipelines(pipelinesWithLockStatus);
      } else {
        console.error('API response failed:', { metadataResponse: metadataResponse.data, awsResponse: awsResponse.data });
        setError('Failed to fetch pipelines - API returned unsuccessful response');
      }
    } catch (err: any) {
      console.error('Error fetching pipelines:', err);
      setError(`Error connecting to server: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // Filter pipelines based on search term
  useEffect(() => {
    try {
      if (!searchTerm) {
        setFilteredPipelines(pipelines);
      } else {
        const filtered = pipelines.filter(pipeline => {
          if (!pipeline) return false;
          
          const searchLower = searchTerm.toLowerCase();
          const name = pipeline.name || '';
          const repo = pipeline.repositoryName || '';
          const branch = pipeline.branchName || '';
          const namespace = pipeline.deploymentConfig?.namespace || '';
          
          return name.toLowerCase().includes(searchLower) ||
                 repo.toLowerCase().includes(searchLower) ||
                 branch.toLowerCase().includes(searchLower) ||
                 namespace.toLowerCase().includes(searchLower);
        });
        setFilteredPipelines(filtered);
      }
      setCurrentPage(1); // Reset to first page when searching
    } catch (err) {
      console.error('Error filtering pipelines:', err);
      setFilteredPipelines(pipelines); // Fallback to showing all pipelines
    }
  }, [searchTerm, pipelines]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredPipelines.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentPipelines = filteredPipelines.slice(startIndex, endIndex);

  const handleEdit = async (pipeline: PipelineMetadata) => {
    // Check if pipeline is locked by someone else (not the current user)
    if (pipeline.lockStatus && pipeline.lockStatus.locked_by !== userId) {
      const lockTime = new Date(pipeline.lockStatus.locked_at).toLocaleString();
      const expiryTime = new Date(pipeline.lockStatus.expires_at).toLocaleString();
      setSyncNotification(`🔒 Pipeline locked by ${pipeline.lockStatus.locked_by} until ${expiryTime}`);
      setTimeout(() => setSyncNotification(null), 5000);
      return;
    }
    
    // Store the pipeline data in sessionStorage for the edit form
    sessionStorage.setItem('editPipeline', JSON.stringify(pipeline));
    navigate('/create', { state: { editMode: true, pipeline } });
  };

  const handleDelete = async (pipelineName: string) => {
    try {
      // First, delete AWS resources
      const resourceResponse = await axios.delete(getApiUrl(`/api/pipelines/${pipelineName}/delete`));
      
      // Show non-blocking notification
      if (resourceResponse.data.successes && resourceResponse.data.successes.length > 0) {
        setSyncNotification(`✅ ${pipelineName} deleted successfully`);
      } else if (resourceResponse.data.errors && resourceResponse.data.errors.length > 0) {
        setSyncNotification(`⚠️ ${pipelineName} deleted with errors`);
      } else {
        setSyncNotification(`✅ ${pipelineName} deletion completed`);
      }
      setTimeout(() => setSyncNotification(null), 4000);
      
      // Refresh the list
      fetchPipelines();
      setDeleteConfirm(null);
    } catch (err: any) {
      setSyncNotification(`❌ Delete failed: ${err.response?.data?.error || err.message}`);
      setTimeout(() => setSyncNotification(null), 5000);
    }
  };

  // Bulk selection functions
  const togglePipelineSelection = (pipelineName: string) => {
    const newSelected = new Set(selectedPipelines);
    if (newSelected.has(pipelineName)) {
      newSelected.delete(pipelineName);
    } else {
      newSelected.add(pipelineName);
    }
    setSelectedPipelines(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedPipelines.size === currentPipelines.length) {
      setSelectedPipelines(new Set());
    } else {
      setSelectedPipelines(new Set(currentPipelines.map(p => p.name)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPipelines.size === 0) return;
    
    try {
      const pipelineList = Array.from(selectedPipelines);
      const results = [];
      
      // Delete pipelines sequentially to avoid CodeCommit race conditions
      for (let i = 0; i < pipelineList.length; i++) {
        const pipelineName = pipelineList[i];
        
        // Update progress notification
        setSyncNotification(`🔄 Deleting pipeline ${i + 1} of ${pipelineList.length}: ${pipelineName}...`);
        
        try {
          const response = await axios.delete(getApiUrl(`/api/pipelines/${pipelineName}/delete`));
          results.push({ pipelineName, success: true, response: response.data });
          
          // Add a small delay between deletions to ensure CodeCommit operations complete
          if (i < pipelineList.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (error: any) {
          results.push({ 
            pipelineName, 
            success: false, 
            error: error.response?.data?.error || error.message 
          });
        }
      }
      
      // Create summary message
      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);
      
      // Show non-blocking notification
      if (successful.length > 0 && failed.length === 0) {
        setSyncNotification(`✅ Successfully deleted ${successful.length} pipeline(s)`);
      } else if (failed.length > 0 && successful.length === 0) {
        setSyncNotification(`❌ Failed to delete ${failed.length} pipeline(s)`);
      } else {
        setSyncNotification(`⚠️ Deleted ${successful.length}, failed ${failed.length} pipeline(s)`);
      }
      setTimeout(() => setSyncNotification(null), 5000);
      
      // Clear selection and refresh list
      setSelectedPipelines(new Set());
      setShowBulkDeleteConfirm(false);
      fetchPipelines();
    } catch (err: any) {
      setSyncNotification(`❌ Bulk deletion error: ${err.message}`);
      setTimeout(() => setSyncNotification(null), 5000);
    }
  };

  const [syncNotification, setSyncNotification] = useState<string | null>(null);

  const handleSyncFromAWS = async (pipelineName: string) => {
    try {
      const response = await axios.get(getApiUrl(`/api/pipelines/${pipelineName}/sync`));
      
      if (response.data.success) {
        // Show brief notification instead of alert
        setSyncNotification(`✅ ${pipelineName} synced from AWS`);
        setTimeout(() => setSyncNotification(null), 3000); // Auto-hide after 3 seconds
        
        // Refresh the pipeline list to show updated data
        fetchPipelines();
      } else {
        setSyncNotification(`❌ Sync failed: ${response.data.error}`);
        setTimeout(() => setSyncNotification(null), 5000);
      }
    } catch (error: any) {
      setSyncNotification(`❌ Sync error: ${error.response?.data?.error || error.message}`);
      setTimeout(() => setSyncNotification(null), 5000);
    }
  };

  const autoSyncAllPipelines = async () => {
    try {
      // Auto-sync first 5 pipelines to avoid overwhelming
      const pipelinesToSync = currentPipelines.slice(0, 5);
      
      for (const pipeline of pipelinesToSync) {
        try {
          await axios.get(getApiUrl(`/api/pipelines/${pipeline.name}/sync`));
        } catch (error) {
          // Silently continue with other pipelines
          console.log(`Auto-sync failed for ${pipeline.name}:`, error);
        }
      }
      
      // Refresh list after auto-sync
      fetchPipelines();
    } catch (error) {
      console.log('Auto-sync error:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="pipeline-form">
        <div className="header">
          <h1>Existing Pipelines</h1>
        </div>
        <div className="section">
          <p>Loading pipelines...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="pipeline-form">
        <div className="header">
          <h1>Existing Pipelines</h1>
        </div>
        <div className="section">
          <p className="error">{error}</p>
          <button onClick={() => navigate('/')}>Back to Home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="pipeline-form">
      <div className="header">
        <h1>Existing Pipelines</h1>
      </div>
      
      {/* Sync Notification */}
      {syncNotification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: syncNotification.includes('✅') ? '#4caf50' : '#f44336',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '4px',
          boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
          zIndex: 1000,
          fontSize: '14px',
          fontWeight: 'bold'
        }}>
          {syncNotification}
        </div>
      )}

      <div className="section">
        <div style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <h2>Pipeline List ({filteredPipelines.length} of {pipelines.length} pipelines)</h2>
          <button onClick={() => navigate('/')} style={{ marginRight: '10px' }}>
            Back to Home
          </button>
        </div>

        {/* Search and Filter Controls */}
        <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1', minWidth: '300px' }}>
            <input
              type="text"
              placeholder="Search pipelines by name, repository, branch, or namespace..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '14px'
              }}
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              style={{
                padding: '10px 15px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Clear Search
            </button>
          )}
        </div>

        {/* Bulk Selection Controls */}
        <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', backgroundColor: '#f8f9fa', padding: '15px', borderRadius: '4px', border: '1px solid #e9ecef' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="checkbox"
              checked={selectedPipelines.size > 0 && selectedPipelines.size === currentPipelines.length}
              onChange={toggleSelectAll}
              style={{ transform: 'scale(1.2)' }}
            />
            <label style={{ fontWeight: 'bold', margin: 0 }}>
              Select All ({selectedPipelines.size} selected)
            </label>
          </div>
          
          {selectedPipelines.size > 0 && (
            <>
              <button
                onClick={() => setSelectedPipelines(new Set())}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Clear Selection
              </button>
              <button
                onClick={() => setShowBulkDeleteConfirm(true)}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Delete Selected ({selectedPipelines.size})
              </button>
            </>
          )}
        </div>

        {/* Pagination Info */}
        {filteredPipelines.length > itemsPerPage && (
          <div style={{ marginBottom: '15px', color: '#666', fontSize: '14px' }}>
            Showing {startIndex + 1}-{Math.min(endIndex, filteredPipelines.length)} of {filteredPipelines.length} pipelines
            (Page {currentPage} of {totalPages})
          </div>
        )}

        {filteredPipelines.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px' }}>
            <p>{searchTerm ? 'No pipelines match your search criteria.' : 'No pipelines found.'}</p>
            {!searchTerm && (
              <button onClick={() => navigate('/create')} className="add-pipeline">
                Create Your First Pipeline
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="pipelines-grid">
              {currentPipelines.map((pipeline) => (
              <div key={pipeline.name} className={`pipeline-card ${pipeline.lockStatus ? 'locked' : ''} ${selectedPipelines.has(pipeline.name) ? 'selected' : ''}`}>
                <div className="pipeline-card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input
                      type="checkbox"
                      checked={selectedPipelines.has(pipeline.name)}
                      onChange={() => togglePipelineSelection(pipeline.name)}
                      style={{ transform: 'scale(1.2)' }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <h3 style={{ margin: 0 }}>
                    {pipeline.name}
                    {pipeline.lockStatus && (
                      <span style={{ 
                        marginLeft: '10px', 
                        fontSize: '14px', 
                        color: '#ff9800',
                        fontWeight: 'normal'
                      }}>
                        🔒 {pipeline.lockStatus.locked_by === userId ? 'Locked by you' : `Locked by ${pipeline.lockStatus.locked_by}`}
                      </span>
                    )}
                    </h3>
                  </div>
                  <div className="pipeline-actions">
                    {pipeline.lockStatus && pipeline.lockStatus.locked_by !== userId ? (
                      <button 
                        className="edit-btn"
                        title={`Locked by ${pipeline.lockStatus.locked_by} - expires at ${new Date(pipeline.lockStatus.expires_at).toLocaleString()}`}
                        disabled={true}
                        style={{
                          opacity: 0.3,
                          cursor: 'not-allowed',
                          backgroundColor: '#ccc'
                        }}
                      >
                        🔒
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleEdit(pipeline)}
                        className="edit-btn"
                        title="Edit Pipeline"
                      >
                        ✏️
                      </button>
                    )}
                    <button 
                      onClick={() => handleSyncFromAWS(pipeline.name)}
                      className="sync-btn"
                      title="Manual sync from AWS (auto-sync runs every 60s)"
                      style={{
                        padding: '5px 10px',
                        fontSize: '16px',
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        transition: 'background 0.2s'
                      }}
                    >
                      🔄
                    </button>
                    <button 
                      onClick={() => setDeleteConfirm(pipeline.name)}
                      className="delete-btn"
                      title="Delete Pipeline"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
                
                <div className="pipeline-card-body">
                  <div className="pipeline-info">
                    <p><strong>Repository:</strong> {pipeline.repositoryName}</p>
                    <p><strong>Branch:</strong> {pipeline.branchName}</p>
                    <p><strong>Compute Type:</strong> {pipeline.computeType}</p>
                    {pipeline.deploymentConfig && (
                      <p><strong>Deployment:</strong> {pipeline.deploymentConfig.namespace} / {pipeline.deploymentConfig.appType}</p>
                    )}
                    {pipeline.scalingConfig && (
                      <p><strong>Scaling:</strong> {pipeline.scalingConfig.type.toUpperCase()}</p>
                    )}
                  </div>
                  
                  {pipeline.resources && (
                    <div className="pipeline-resources">
                      <h4>Resources:</h4>
                      <ul>
                        <li>Pipeline: {pipeline.resources.pipeline}</li>
                        <li>CodeBuild: {pipeline.resources.codebuild}</li>
                        <li>ECR: {pipeline.resources.ecrRepository}</li>
                        {pipeline.resources.appsettingsRepo && (
                          <li>AppSettings: {pipeline.resources.appsettingsRepo}</li>
                        )}
                        {pipeline.resources.manifestRepo && (
                          <li>Manifest: {pipeline.resources.manifestRepo}</li>
                        )}
                      </ul>
                    </div>
                  )}
                  
                  <div className="pipeline-dates">
                    <p><small>Created: {formatDate(pipeline.createdAt)}</small></p>
                    <p><small>Updated: {formatDate(pipeline.lastUpdated)}</small></p>
                  </div>
                </div>

                {deleteConfirm === pipeline.name && (
                  <div className="delete-confirm">
                    <p><strong>Are you sure you want to delete this pipeline?</strong></p>
                    <p style={{ color: '#d32f2f', fontSize: '14px', margin: '10px 0' }}>
                      This will delete the following AWS resources:
                    </p>
                    <ul style={{ color: '#d32f2f', fontSize: '13px', margin: '10px 0', paddingLeft: '20px' }}>
                      <li>CodePipeline: {pipeline.name}</li>
                      <li>CodeBuild project: {pipeline.name}-build</li>
                      <li>ECR repository: {pipeline.name} (including all Docker images)</li>
                      <li>Manifest folder in staging-repo/{pipeline.name}/</li>
                      <li>Appsettings folder in modernization-appsettings-repo/{pipeline.name}/</li>
                    </ul>
                    <p style={{ color: '#ff6b00', fontSize: '12px', fontStyle: 'italic' }}>
                      Warning: This action cannot be undone. All resources will be permanently deleted.
                    </p>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
                      <button 
                        onClick={() => handleDelete(pipeline.name)}
                        className="remove-pipeline"
                      >
                        Yes, Delete All Resources
                      </button>
                      <button 
                        onClick={() => setDeleteConfirm(null)}
                        className="cancel-button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              ))}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                gap: '10px', 
                marginTop: '30px',
                padding: '20px'
              }}>
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: currentPage === 1 ? '#ccc' : '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  First
                </button>
                
                <button
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: currentPage === 1 ? '#ccc' : '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Previous
                </button>

                <span style={{ 
                  padding: '8px 16px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px',
                  fontWeight: 'bold'
                }}>
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: currentPage === totalPages ? '#ccc' : '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  Next
                </button>

                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                  style={{
                    padding: '8px 12px',
                    backgroundColor: currentPage === totalPages ? '#ccc' : '#2196f3',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  Last
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bulk Delete Confirmation Modal */}
      {showBulkDeleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: 'white',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '600px',
            maxHeight: '80vh',
            overflow: 'auto',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
          }}>
            <h3 style={{ color: '#d32f2f', marginTop: 0 }}>
              Confirm Bulk Deletion
            </h3>
            <p><strong>Are you sure you want to delete {selectedPipelines.size} pipeline(s)?</strong></p>
            <p style={{ color: '#d32f2f', fontSize: '14px', margin: '15px 0' }}>
              This will delete the following AWS resources for each pipeline:
            </p>
            
            <div style={{ backgroundColor: '#ffebee', padding: '15px', borderRadius: '4px', marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#d32f2f' }}>Pipelines to be deleted:</h4>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                {Array.from(selectedPipelines).map(name => (
                  <li key={name} style={{ color: '#d32f2f', fontWeight: 'bold' }}>{name}</li>
                ))}
              </ul>
            </div>

            <ul style={{ color: '#d32f2f', fontSize: '13px', margin: '15px 0', paddingLeft: '20px' }}>
              <li>CodePipeline and all pipeline history</li>
              <li>CodeBuild project and build logs</li>
              <li>ECR repository including all Docker images</li>
              <li>Manifest folders in staging repositories</li>
              <li>Appsettings folders in configuration repositories</li>
            </ul>
            
            <p style={{ color: '#ff6b00', fontSize: '12px', fontStyle: 'italic', marginBottom: '20px' }}>
              Warning: This action cannot be undone. All resources will be permanently deleted.
            </p>
            
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowBulkDeleteConfirm(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#6c757d',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#d32f2f',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Yes, Delete All {selectedPipelines.size} Pipelines
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .pipelines-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 20px;
          margin-top: 20px;
        }

        .pipeline-card {
          background: white;
          border: 1px solid #ddd;
          border-radius: 8px;
          overflow: hidden;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          transition: box-shadow 0.3s;
        }

        .pipeline-card:hover {
          box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }

        .pipeline-card.selected {
          border: 2px solid #2196f3;
          box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
        }

        .pipeline-card-header {
          background: #f5f5f5;
          padding: 15px 20px;
          border-bottom: 1px solid #ddd;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .pipeline-card-header h3 {
          margin: 0;
          color: #1976d2;
        }

        .pipeline-actions {
          display: flex;
          gap: 8px;
        }

        .pipeline-actions button {
          padding: 5px 10px;
          font-size: 16px;
          border: none;
          background: none;
          cursor: pointer;
          border-radius: 4px;
          transition: background 0.2s;
        }

        .edit-btn:hover {
          background: #e3f2fd;
        }

        .sync-btn:hover {
          background: #e8f5e8;
        }

        .delete-btn:hover {
          background: #ffebee;
        }

        .pipeline-card-body {
          padding: 20px;
        }

        .pipeline-info {
          margin-bottom: 15px;
        }

        .pipeline-info p {
          margin: 5px 0;
          color: #333;
        }

        .pipeline-resources {
          margin: 15px 0;
          padding: 10px;
          background: #f9f9f9;
          border-radius: 4px;
        }

        .pipeline-resources h4 {
          margin: 0 0 8px 0;
          color: #666;
          font-size: 14px;
        }

        .pipeline-resources ul {
          margin: 0;
          padding-left: 20px;
          font-size: 13px;
        }

        .pipeline-resources li {
          margin: 3px 0;
          color: #555;
        }

        .pipeline-dates {
          margin-top: 15px;
          padding-top: 10px;
          border-top: 1px solid #eee;
          color: #666;
        }

        .pipeline-dates p {
          margin: 3px 0;
        }

        .delete-confirm {
          background: #ffebee;
          padding: 15px;
          border-top: 1px solid #ffcdd2;
        }

        .delete-confirm p {
          margin: 5px 0;
        }
      `}</style>
    </div>
  );
};

export default PipelineList;