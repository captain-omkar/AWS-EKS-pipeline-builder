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
  const [userId] = useState(() => {
    // Generate or retrieve user ID for lock management
    let id = localStorage.getItem('userId');
    if (!id) {
      id = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('userId', id);
    }
    return id;
  });

  useEffect(() => {
    fetchPipelines();
    // Refresh lock status more frequently (every 3 seconds)
    const lockInterval = setInterval(() => {
      updateLockStatus();
    }, 3000);
    
    // Check for new pipelines less frequently (every 10 seconds)
    const pipelineInterval = setInterval(() => {
      checkForNewPipelines();
    }, 10000);
    
    return () => {
      clearInterval(lockInterval);
      clearInterval(pipelineInterval);
    };
  }, []);

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
      // Fetch both metadata and AWS pipelines with lock status
      const [metadataResponse, awsResponse] = await Promise.all([
        axios.get(getApiUrl('/api/pipeline-metadata')),
        axios.get(getApiUrl('/api/pipelines'))
      ]);
      
      if (metadataResponse.data.success && awsResponse.data.success) {
        const metadataPipelines = metadataResponse.data.pipelines;
        const awsPipelines = awsResponse.data.pipelines;
        
        // Create a map of AWS pipelines with lock status
        const lockStatusMap = new Map();
        awsPipelines.forEach((awsPipeline: any) => {
          if (awsPipeline.lockStatus) {
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
        setError('Failed to fetch pipelines');
      }
    } catch (err) {
      setError('Error connecting to server');
    } finally {
      setLoading(false);
    }
  };

  // Filter pipelines based on search term
  useEffect(() => {
    if (!searchTerm) {
      setFilteredPipelines(pipelines);
    } else {
      const filtered = pipelines.filter(pipeline =>
        pipeline.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pipeline.repositoryName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        pipeline.branchName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (pipeline.deploymentConfig?.namespace && pipeline.deploymentConfig.namespace.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredPipelines(filtered);
    }
    setCurrentPage(1); // Reset to first page when searching
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
      alert(`This pipeline is currently being edited by ${pipeline.lockStatus.locked_by}.\n\nLocked at: ${lockTime}\nExpires at: ${expiryTime}\n\nPlease try again later.`);
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
      
      let message = '';
      if (resourceResponse.data.successes && resourceResponse.data.successes.length > 0) {
        message += 'Successfully deleted:\n' + resourceResponse.data.successes.join('\n');
      }
      if (resourceResponse.data.errors && resourceResponse.data.errors.length > 0) {
        message += '\n\nErrors:\n' + resourceResponse.data.errors.join('\n');
      }
      
      // Show the results
      alert(message || 'Pipeline deletion completed');
      
      // Refresh the list
      fetchPipelines();
      setDeleteConfirm(null);
    } catch (err: any) {
      alert(`Error deleting pipeline: ${err.response?.data?.error || err.message}`);
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
              <div key={pipeline.name} className={`pipeline-card ${pipeline.lockStatus ? 'locked' : ''}`}>
                <div className="pipeline-card-header">
                  <h3>
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