import React, { useState } from 'react';
import { adAPI } from '../services/api';

const AdList = ({ ads, onRefresh }) => {
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    title: '',
    advertiser: '',
    duration: 30
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

  // 광고 활성화 상태 토글 핸들러
  const handleToggleActive = async (adId, currentActive) => {
    try {
      console.log(`Toggle active for ad ${adId}: ${currentActive} -> ${currentActive === "true" ? "false" : "true"}`);
      
      const result = await adAPI.toggleAdStatus(adId, currentActive);
      console.log('Toggle API response:', result); // 디버깅 로그 추가
      
      // 백엔드 응답 구조에 맞게 수정
      if (result && (result.message || result.ad || result.success !== false)) {
        // 성공적으로 토글됨
        onRefresh(); // 광고 목록 새로고침
        
        // 응답에서 새로운 상태 확인 (여러 가능한 구조 지원)
        let newActiveStatus;
        if (result.ad && result.ad.active) {
          newActiveStatus = result.ad.active;
        } else if (result.active) {
          newActiveStatus = result.active;
        } else {
          // 응답에 상태가 없으면 토글된 값으로 추정
          newActiveStatus = currentActive === "true" ? "false" : "true";
        }
        
        const newStatus = newActiveStatus === "true" ? "Active" : "Inactive";
        alert(`Ad status updated to ${newStatus}`);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Failed to toggle active status:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response,
        stack: error.stack
      });
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
      console.log('Delete API response:', result); // 디버깅 로그 추가
      
      // 백엔드 응답 구조에 맞게 수정
      if (result && (result.message || result.success !== false)) {
        // 성공적으로 삭제됨
        onRefresh(); // 광고 목록 새로고침
        alert('Ad deleted successfully');
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (error) {
      console.error('Failed to delete ad:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response,
        stack: error.stack
      });
      
      // 백엔드 에러 메시지 표시
      let errorMessage = 'Failed to delete ad: ' + error.message;
      
      // 활성 스케줄이 있는 경우 특별한 메시지 표시
      if (error.response?.status === 400) {
        const errorData = error.response.data;
        
        if (errorData?.error?.includes('active schedules')) {
          const activeSchedules = errorData.active_schedules || 0;
          errorMessage = `Cannot delete ad: ${activeSchedules} active schedule(s) are using this ad.\n\nPlease delete or complete the schedules first.`;
        } else if (errorData?.error) {
          errorMessage = `Delete failed: ${errorData.error}`;
        } else {
          errorMessage = `Delete failed: Bad Request (400)\n\nThis might be due to:\n• API endpoint not properly configured\n• Active schedules using this ad\n• Server-side validation error\n\nPlease check the console for more details.`;
        }
      }
      
      alert(errorMessage);
    }
  };

  // 업로드 폼 데이터 변경
  const handleUploadFormChange = (e) => {
    const { name, value } = e.target;
    setUploadForm(prev => ({
      ...prev,
      [name]: value
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
        duration: parseInt(uploadForm.duration)
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
          duration: 30
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

  // 페이지네이션 렌더링 개선
  const renderPagination = () => {
    if (totalPages <= 1) return null;

    const pageNumbers = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      // 총 페이지가 5개 이하면 모든 페이지 번호 표시
      for (let i = 1; i <= totalPages; i++) {
        pageNumbers.push(
          <button
            key={i}
            className={`page-number ${currentPage === i ? 'active' : ''}`}
            onClick={() => handlePageChange(i)}
          >
            {i}
          </button>
        );
      }
    } else {
      // 총 페이지가 5개를 넘으면 축약 표시
      if (currentPage <= 3) {
        // 현재 페이지가 앞쪽에 있을 때: 1,2,3,4,5...10
        for (let i = 1; i <= 5; i++) {
          pageNumbers.push(
            <button
              key={i}
              className={`page-number ${currentPage === i ? 'active' : ''}`}
              onClick={() => handlePageChange(i)}
            >
              {i}
            </button>
          );
        }
        if (totalPages > 5) {
          pageNumbers.push(<span key="ellipsis1" className="page-ellipsis">...</span>);
          pageNumbers.push(
            <button
              key={totalPages}
              className="page-number"
              onClick={() => handlePageChange(totalPages)}
            >
              {totalPages}
            </button>
          );
        }
      } else if (currentPage >= totalPages - 2) {
        // 현재 페이지가 뒤쪽에 있을 때: 1...6,7,8,9,10
        pageNumbers.push(
          <button
            key={1}
            className="page-number"
            onClick={() => handlePageChange(1)}
          >
            1
          </button>
        );
        pageNumbers.push(<span key="ellipsis2" className="page-ellipsis">...</span>);
        for (let i = totalPages - 4; i <= totalPages; i++) {
          pageNumbers.push(
            <button
              key={i}
              className={`page-number ${currentPage === i ? 'active' : ''}`}
              onClick={() => handlePageChange(i)}
            >
              {i}
            </button>
          );
        }
      } else {
        // 현재 페이지가 중간에 있을 때: 1...4,5,6...10
        pageNumbers.push(
          <button
            key={1}
            className="page-number"
            onClick={() => handlePageChange(1)}
          >
            1
          </button>
        );
        pageNumbers.push(<span key="ellipsis3" className="page-ellipsis">...</span>);
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pageNumbers.push(
            <button
              key={i}
              className={`page-number ${currentPage === i ? 'active' : ''}`}
              onClick={() => handlePageChange(i)}
            >
              {i}
            </button>
          );
        }
        pageNumbers.push(<span key="ellipsis4" className="page-ellipsis">...</span>);
        pageNumbers.push(
          <button
            key={totalPages}
            className="page-number"
            onClick={() => handlePageChange(totalPages)}
          >
            {totalPages}
          </button>
        );
      }
    }

    return (
      <div className="pagination">
        <button
          className="pagination-btn"
          onClick={() => handlePageChange(currentPage - 1)}
          disabled={currentPage === 1}
        >
          ← Previous
        </button>
        
        <div className="page-numbers">
          {pageNumbers}
        </div>
        
        <button
          className="pagination-btn"
          onClick={() => handlePageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          Next →
        </button>
      </div>
    );
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

      {/* 페이지네이션을 통계 섹션 위로 이동 */}
      {renderPagination()}

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
    </div>
  );
};

export default AdList;
