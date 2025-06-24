"""
Pipeline lock manager for preventing concurrent edits
"""
import time
from typing import Dict, Optional, Any
from datetime import datetime, timedelta
import threading


class LockManager:
    def __init__(self, lock_timeout_minutes: int = 30):
        """
        Initialize lock manager
        
        Args:
            lock_timeout_minutes: Minutes before a lock expires automatically
        """
        self.locks: Dict[str, Dict[str, Any]] = {}
        self.lock_timeout_minutes = lock_timeout_minutes
        self._lock = threading.Lock()
        
        # Start cleanup thread
        self._start_cleanup_thread()
    
    def acquire_lock(self, pipeline_name: str, user_id: str, force: bool = False) -> Dict[str, Any]:
        """
        Acquire a lock on a pipeline
        
        Args:
            pipeline_name: Name of the pipeline to lock
            user_id: ID of the user acquiring the lock
            force: Force acquire the lock even if someone else holds it
            
        Returns:
            Dict with lock status and details
        """
        with self._lock:
            current_time = datetime.now()
            
            # Check if pipeline is already locked
            if pipeline_name in self.locks:
                lock_info = self.locks[pipeline_name]
                lock_expiry = lock_info['acquired_at'] + timedelta(minutes=self.lock_timeout_minutes)
                
                # Check if lock has expired
                if current_time > lock_expiry:
                    # Lock expired, remove it
                    del self.locks[pipeline_name]
                elif not force and lock_info['user_id'] != user_id:
                    # Someone else holds the lock
                    return {
                        'success': False,
                        'locked': True,
                        'locked_by': lock_info['user_id'],
                        'locked_at': lock_info['acquired_at'].isoformat(),
                        'expires_at': lock_expiry.isoformat(),
                        'message': f"Pipeline is currently being edited by {lock_info['user_id']}"
                    }
            
            # Acquire the lock
            self.locks[pipeline_name] = {
                'user_id': user_id,
                'acquired_at': current_time,
                'last_activity': current_time
            }
            
            return {
                'success': True,
                'locked': True,
                'locked_by': user_id,
                'locked_at': current_time.isoformat(),
                'expires_at': (current_time + timedelta(minutes=self.lock_timeout_minutes)).isoformat(),
                'message': 'Lock acquired successfully'
            }
    
    def release_lock(self, pipeline_name: str, user_id: str) -> Dict[str, Any]:
        """
        Release a lock on a pipeline
        
        Args:
            pipeline_name: Name of the pipeline to unlock
            user_id: ID of the user releasing the lock
            
        Returns:
            Dict with release status
        """
        with self._lock:
            if pipeline_name not in self.locks:
                return {
                    'success': True,
                    'message': 'Pipeline was not locked'
                }
            
            lock_info = self.locks[pipeline_name]
            if lock_info['user_id'] != user_id:
                return {
                    'success': False,
                    'message': f"Cannot release lock held by {lock_info['user_id']}"
                }
            
            del self.locks[pipeline_name]
            return {
                'success': True,
                'message': 'Lock released successfully'
            }
    
    def refresh_lock(self, pipeline_name: str, user_id: str) -> Dict[str, Any]:
        """
        Refresh a lock to prevent timeout
        
        Args:
            pipeline_name: Name of the pipeline
            user_id: ID of the user refreshing the lock
            
        Returns:
            Dict with refresh status
        """
        with self._lock:
            if pipeline_name not in self.locks:
                return {
                    'success': False,
                    'message': 'Pipeline is not locked'
                }
            
            lock_info = self.locks[pipeline_name]
            if lock_info['user_id'] != user_id:
                return {
                    'success': False,
                    'message': f"Cannot refresh lock held by {lock_info['user_id']}"
                }
            
            lock_info['last_activity'] = datetime.now()
            return {
                'success': True,
                'message': 'Lock refreshed successfully'
            }
    
    def get_lock_status(self, pipeline_name: str) -> Optional[Dict[str, Any]]:
        """
        Get the current lock status of a pipeline
        
        Args:
            pipeline_name: Name of the pipeline
            
        Returns:
            Lock information if locked, None otherwise
        """
        with self._lock:
            if pipeline_name not in self.locks:
                return None
            
            lock_info = self.locks[pipeline_name]
            current_time = datetime.now()
            lock_expiry = lock_info['acquired_at'] + timedelta(minutes=self.lock_timeout_minutes)
            
            # Check if lock has expired
            if current_time > lock_expiry:
                del self.locks[pipeline_name]
                return None
            
            return {
                'locked': True,
                'locked_by': lock_info['user_id'],
                'locked_at': lock_info['acquired_at'].isoformat(),
                'expires_at': lock_expiry.isoformat()
            }
    
    def get_all_locks(self) -> Dict[str, Dict[str, Any]]:
        """
        Get all current locks
        
        Returns:
            Dict of all locks
        """
        with self._lock:
            current_time = datetime.now()
            result = {}
            
            # Clean up expired locks
            expired_pipelines = []
            for pipeline_name, lock_info in self.locks.items():
                lock_expiry = lock_info['acquired_at'] + timedelta(minutes=self.lock_timeout_minutes)
                if current_time > lock_expiry:
                    expired_pipelines.append(pipeline_name)
                else:
                    result[pipeline_name] = {
                        'locked_by': lock_info['user_id'],
                        'locked_at': lock_info['acquired_at'].isoformat(),
                        'expires_at': lock_expiry.isoformat()
                    }
            
            # Remove expired locks
            for pipeline_name in expired_pipelines:
                del self.locks[pipeline_name]
            
            return result
    
    def _cleanup_expired_locks(self):
        """
        Clean up expired locks periodically
        """
        with self._lock:
            current_time = datetime.now()
            expired_pipelines = []
            
            for pipeline_name, lock_info in self.locks.items():
                lock_expiry = lock_info['acquired_at'] + timedelta(minutes=self.lock_timeout_minutes)
                if current_time > lock_expiry:
                    expired_pipelines.append(pipeline_name)
            
            for pipeline_name in expired_pipelines:
                del self.locks[pipeline_name]
                print(f"🔓 Expired lock removed for pipeline: {pipeline_name}")
    
    def _start_cleanup_thread(self):
        """
        Start a background thread to clean up expired locks
        """
        def cleanup_loop():
            while True:
                time.sleep(60)  # Check every minute
                self._cleanup_expired_locks()
        
        cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
        cleanup_thread.start()


# Global lock manager instance
lock_manager = LockManager(lock_timeout_minutes=30)