import React, { useState } from 'react';
import { adAPI } from '../services/api';

const AdList = ({ ads, onRefresh }) => {
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    advertiser: '',
    duration: 30,
    active: true  // category 제거, active 추가
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadStep, setUploadStep] = useState(1); // 1: 정보입력, 2: 파일업로드
  
  // 페이지네이션 상태 추가
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // 페이지네이션 계산
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentAds = ads.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(ads.length / itemsPerPage);

  // 페이지 변경 핸들러
  const handlePageChange = (pageNumber) => {
    setCurrentPage(pageNumber);
  };

  // Active 상태 토글 핸들러
  const handleToggleActive = async (adId, currentActive) => {
    try {
      console.log(`Toggle active for ad ${adId}: ${currentActive} -> ${currentActive === "true" ? "false" : "true"}`);
      
      const result = await adAPI.toggleAdStatus(adId, currentActive);
      
      if (result.ad_id) {
        // 성공적으로 토글됨
        onRefresh(); // 광고 목록 새로고침
        
        const newStatus = result.active === "true" ? "Active" : "Inactive";
        alert(`Ad status updated to ${newStatus}`);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Failed to toggle active status:', error);
      alert('Failed to toggle active status: ' + error.message);
    }
  };

  // 광고 삭제 핸들러
  const handleDeleteAd = async (adId) => {
    if (!window.confirm('Are you sure you want to delete this ad?\n\nThis action cannot be undone.')) {
      return;
    }
    
    try {
      console.log(`Delete ad ${adId}`);
      
      const result = await adAPI.deleteAd(adId);
      
      if (result.ad_id) {
        // 성공적으로 삭제됨
        onRefresh(); // 광고 목록 새로고침
        alert('Ad deleted successfully');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Failed to delete ad:', error);
      
      // 활성 스케줄이 있는 경우 특별한 메시지 표시
      if (error.response?.status === 400 && error.response?.data?.error?.includes('active schedules')) {
        const activeSchedules = error.response.data.active_schedules || 0;
        alert(`Cannot delete ad: ${activeSchedules} active schedule(s) are using this ad.\n\nPlease delete or complete the schedules first.`);
      } else {
        alert('Failed to delete ad: ' + error.message);
      }
    }
  };

  // 업로드 폼 데이터 변경
  const handleUploadFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    setUploadForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  // 파일 선택 처리
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      // 파일 타입 검증
      if (!file.type.startsWith('video/')) {
        alert('Please select a video file.');
        return;
      }
      // 파일 크기 검증 (100MB 제한)
      if (file.size > 100 * 1024 * 1024) {
        alert('File size must be less than 100MB.');
        return;
      }
      setSelectedFile(file);
    }
  };

  // 1단계: 광고 정보 저장
  const handleCreateAd = async (e) => {
    e.preventDefault();
    
    if (!uploadForm.title || !uploadForm.advertiser) {
      alert('Please enter title and advertiser.');
      return;
    }

    setUploading(true);
    setUploadProgress('Creating ad information...');

    try {
      const adData = {
        title: uploadForm.title,
        advertiser: uploadForm.advertiser,
        duration: parseInt(uploadForm.duration),
        active: uploadForm.active
      };

      setUploadProgress('Generating presigned URL...');
      const response = await adAPI.createAd(adData);
      
      // 실제 API 응답 구조에 맞게 수정: upload_url 사용
      if (response.upload_url && response.ad_id) {
        // 2단계로 이동
        setUploadStep(2);
        setUploadProgress('Ad information saved. Please select video file.');
        
        // presigned URL 저장
        window.currentPresignedUrl = response.upload_url;
        window.currentAdId = response.ad_id;
        
        // 성공 시 uploading 상태 해제
        setUploading(false);
      } else {
        throw new Error('Invalid response: missing upload_url or ad_id');
      }
    } catch (error) {
      console.error('Create ad error:', error);
      alert('Failed to create ad: ' + error.message);
      setUploading(false);
      setUploadProgress(null);
      // 오류 시 1단계 유지
      setUploadStep(1);
    }
  };

  // 2단계: 파일 업로드
  const handleFileUpload = async () => {
    if (!selectedFile) {
      alert('Please select a video file.');
      return;
    }

    if (!window.currentPresignedUrl) {
      alert('Presigned URL not found. Please try again.');
      return;
    }

    setUploading(true);
    setUploadProgress('Uploading video file...');

    try {
      // Presigned URL로 파일 업로드
      const uploadResponse = await fetch(window.currentPresignedUrl, {
        method: 'PUT',
        body: selectedFile,
        headers: {
          'Content-Type': selectedFile.type
        }
      });

      if (uploadResponse.ok) {
        setUploadProgress('Upload completed successfully!');
        
        alert(`Ad uploaded successfully!\nAd ID: ${window.currentAdId}\nFile: ${selectedFile.name}`);

        // 폼 리셋
        setUploadForm({
          title: '',
          advertiser: '',
          duration: 30,
          active: true
        });
        setSelectedFile(null);
        setUploadStep(1);
        setShowUploadForm(false);
        
        // 정리
        delete window.currentPresignedUrl;
        delete window.currentAdId;
        
        // 광고 목록 새로고침
        onRefresh();
      } else {
        throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload video: ' + error.message);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  // 업로드 취소
  const handleCancelUpload = () => {
    setUploadStep(1);
    setSelectedFile(null);
    setUploadProgress(null);
    delete window.currentPresignedUrl;
    delete window.currentAdId;
  };

  // 상태별 아이콘 렌더링 (실제 API 데이터 구조에 맞게 수정)
  const renderStatusIcon = (ad) => {
    // upload_status와 active 필드를 조합해서 상태 결정
    if (ad.upload_status === 'COMPLETED' && ad.active === "true") {
      return <span className="status-icon" title="Active">✅</span>;
    } else if (ad.upload_status === 'COMPLETED' && ad.active === "false") {
      return <span className="status-icon" title="Inactive">⏸️</span>;
    } else if (ad.upload_status === 'PENDING') {
      return <span className="status-icon" title="Pending Upload">⏳</span>;
    } else {
      return <span className="status-icon" title="Unknown">❓</span>;
    }
  };

  // 상태 텍스트 반환 (실제 API 데이터 구조에 맞게 수정)
  const getStatusText = (ad) => {
    if (ad.upload_status === 'COMPLETED' && ad.active === "true") {
      return 'Active';
    } else if (ad.upload_status === 'COMPLETED' && ad.active === "false") {
      return 'Inactive';
    } else if (ad.upload_status === 'PENDING') {
      return 'Pending';
    } else {
      return 'Unknown';
    }
  };

  return (
    <div className="card">
      <div className="ad-header">
        <h2>Ad Management</h2>
        <div className="ad-controls">
          <button 
            className="btn btn-primary"
            onClick={() => setShowUploadForm(!showUploadForm)}
          >
            {showUploadForm ? '❌ Cancel' : '➕ New Ad'}
          </button>
          <button className="btn btn-secondary" onClick={onRefresh}>
            🔄 Refresh
          </button>
        </div>
      </div>

      <div className="status-legend">
        <div className="legend-items">
          <div className="legend-item">
            <span className="status-icon">✅</span>
            <span>Active</span>
          </div>
          <div className="legend-item">
            <span className="status-icon">⏸️</span>
            <span>Inactive</span>
          </div>
          <div className="legend-item">
            <span className="status-icon">⏳</span>
            <span>Pending</span>
          </div>
        </div>
      </div>

      {showUploadForm && (
        <div className="upload-form">
          <h3>New Ad Upload</h3>
          
          {uploadStep === 1 ? (
            // 1단계: 광고 정보 입력
            <form onSubmit={handleCreateAd}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="title">Ad Title</label>
                  <input
                    type="text"
                    id="title"
                    name="title"
                    value={uploadForm.title}
                    onChange={handleUploadFormChange}
                    placeholder="e.g: Summer Sale Promotion"
                    required
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="advertiser">Advertiser</label>
                  <input
                    type="text"
                    id="advertiser"
                    name="advertiser"
                    value={uploadForm.advertiser}
                    onChange={handleUploadFormChange}
                    placeholder="e.g: ABC Marketing"
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="duration">Ad Length (sec)</label>
                  <input
                    type="number"
                    id="duration"
                    name="duration"
                    value={uploadForm.duration}
                    onChange={handleUploadFormChange}
                    min="1"
                    max="300"
                    placeholder="30"
                    required
                  />
                  <div className="quick-length-buttons">
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setUploadForm(prev => ({ ...prev, duration: 15 }))}
                    >
                      15sec
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setUploadForm(prev => ({ ...prev, duration: 30 }))}
                    >
                      30sec
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setUploadForm(prev => ({ ...prev, duration: 60 }))}
                    >
                      60sec
                    </button>
                  </div>
                </div>
                
                <div className="form-group">
                  <label htmlFor="active">Active Status</label>
                  <div className="active-toggle-form">
                    <input
                      type="checkbox"
                      id="active"
                      name="active"
                      checked={uploadForm.active}
                      onChange={handleUploadFormChange}
                    />
                    <label htmlFor="active" className="toggle-label">
                      {uploadForm.active ? '✅ Active (will be available for scheduling)' : '⏸️ Inactive (will not be available for scheduling)'}
                    </label>
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={uploading}
                >
                  {uploading ? '⏳ Creating...' : '📋 Next: Select Video'}
                </button>
              </div>
            </form>
          ) : (
            // 2단계: 파일 업로드
            <div className="file-upload-section">
              <h4>Select Video File</h4>
              <div className="file-upload-area">
                <input
                  type="file"
                  id="video-file"
                  accept="video/*"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <label 
                  htmlFor="video-file" 
                  className={`file-upload-label ${selectedFile ? 'has-file' : ''}`}
                >
                  {selectedFile ? (
                    <div className="file-info">
                      <span className="file-icon">🎬</span>
                      <div className="file-details">
                        <div className="file-name">{selectedFile.name}</div>
                        <div className="file-size">
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="upload-prompt">
                      <span className="upload-icon">📤</span>
                      <div>Click to select video file</div>
                      <small>MP4, AVI, MOV (Max: 100MB)</small>
                    </div>
                  )}
                </label>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCancelUpload}
                  disabled={uploading}
                >
                  ← Back
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleFileUpload}
                  disabled={!selectedFile || uploading}
                >
                  {uploading ? '⏳ Uploading...' : '🚀 Upload Video'}
                </button>
              </div>
            </div>
          )}

          {uploadProgress && (
            <div className="upload-progress">
              📋 {uploadProgress}
            </div>
          )}
        </div>
      )}

      {ads.length === 0 ? (
        <div className="no-ads">
          🎬 No ads registered. Try uploading a new ad!
        </div>
      ) : (
        <div className="ad-table">
          <table className="table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Ad Info</th>
                <th>Length</th>
                <th>Created</th>
                <th>Active</th>
                <th>VOD</th>
              </tr>
            </thead>
            <tbody>
              {currentAds.map(ad => (
                <tr key={ad.ad_id} className={`ad-row ${getStatusText(ad).toLowerCase()}`}>
                  <td>
                    {renderStatusIcon(ad)}
                  </td>
                  <td>
                    <div className="ad-info">
                      <div className="ad-title">{ad.title}</div>
                      <div className="ad-advertiser">{ad.advertiser}</div>
                      <div className="ad-id">ID: {ad.ad_id.substring(0, 8)}...</div>
                    </div>
                  </td>
                  <td>
                    <span className="duration">{ad.duration}sec</span>
                  </td>
                  <td>
                    <div className="created-date">
                      {new Date(ad.created_at).toLocaleDateString('ko-KR')}
                    </div>
                  </td>
                  <td>
                    <div className="active-toggle">
                      <button
                        className={`btn btn-sm ${ad.active === "true" ? 'btn-success' : 'btn-secondary'}`}
                        onClick={() => handleToggleActive(ad.ad_id, ad.active)}
                        title={ad.active === "true" ? 'Deactivate' : 'Activate'}
                      >
                        {ad.active === "true" ? '✅ Active' : '⏸️ Inactive'}
                      </button>
                    </div>
                  </td>
                  <td>
                    <div className="vod-actions">
                      {ad.cdn_url && (
                        <a
                          href={ad.cdn_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-secondary btn-sm"
                          title="View Video"
                        >
                          🎬 VOD
                        </a>
                      )}
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleDeleteAd(ad.ad_id)}
                        title="Delete Ad"
                        style={{ marginLeft: '0.5rem' }}
                      >
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="ad-summary">
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-label">Total Ads:</span>
            <span className="stat-value">{ads.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Active:</span>
            <span className="stat-value">
              {ads.filter(ad => ad.upload_status === 'COMPLETED' && ad.active === "true").length}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Pending:</span>
            <span className="stat-value">
              {ads.filter(ad => ad.upload_status === 'PENDING').length}
            </span>
          </div>
        </div>
      </div>

      <div className="upload-instructions">
        <h3>Upload Guide</h3>
        <ul style={{ textAlign: 'left', color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.9rem' }}>
          <li>Upload video files using Presigned URL after ad creation</li>
          <li>Supported format: MP4 (H.264 codec recommended)</li>
          <li>Automatically activated after file upload</li>
          <li>Ad length must match actual video length</li>
        </ul>
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, ads.length)} of {ads.length} ads
          </div>
          <div className="pagination-buttons">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i + 1}
                className={`btn btn-secondary ${currentPage === i + 1 ? 'active' : ''}`}
                onClick={() => handlePageChange(i + 1)}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdList;
