// App.jsx - Main component for the VIN Scanner app
import React, { useState, useRef, useEffect } from 'react';
import Tesseract from 'tesseract.js';
import './App.css';

function App() {
  const [vins, setVins] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [currentVin, setCurrentVin] = useState('');
  const [error, setError] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setShowCamera(true);
      }
    } catch (err) {
      setError('Camera access denied or not available');
      console.error('Error accessing camera:', err);
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setShowCamera(false);
    }
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Capture image from camera
  const captureImage = () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    
    // Match canvas size to video feed
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw the current video frame to the canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Convert canvas to blob for OCR processing
    canvas.toBlob(processImage, 'image/jpeg');
    
    setScanning(true);
  };

  // Process image with Tesseract OCR
  const processImage = async (blob) => {
    try {
      const result = await Tesseract.recognize(
        blob,
        'eng',
        { 
          logger: m => console.log(m),
          tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
        }
      );
      
      // Clean and parse the text to find potential VINs
      const text = result.data.text;
      console.log('OCR Result:', text);
      
      // Look for VIN-like patterns (17 alphanumeric characters)
      const potentialVins = extractPotentialVins(text);
      
      if (potentialVins.length > 0) {
        // Try to validate each potential VIN
        const validVin = potentialVins.find(validateVin);
        
        if (validVin) {
          setCurrentVin(validVin);
          setError('');
        } else {
          setError('No valid VIN found in scan. Try again.');
        }
      } else {
        setError('No VIN-like pattern found. Try again.');
      }
    } catch (err) {
      setError('Failed to process image. Try again.');
      console.error('OCR error:', err);
    }
    
    setScanning(false);
  };

  // Extract potential VINs from OCR text
  const extractPotentialVins = (text) => {
    // Clean the text (remove spaces, new lines, etc.)
    const cleanText = text.replace(/[\s\n\r\t]/g, '');
    
    // Look for 17-character sequences of letters and numbers
    const vinRegex = /[A-HJ-NPR-Z0-9]{17}/gi; // VINs don't use I, O, or Q
    return cleanText.match(vinRegex) || [];
  };

  // Validate a VIN using the standard VIN validation algorithm
  const validateVin = (vin) => {
    // Basic validation - length must be exactly 17
    if (vin.length !== 17) return false;
    
    // Check for invalid characters (I, O, Q are not used in VINs)
    if (/[IOQ]/i.test(vin)) return false;
    
    // This is a simplified validation
    // A real implementation would include checksum validation
    // For now we're just checking format
    return true;
  };

  // Handle file uploads
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setScanning(true);
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const result = await Tesseract.recognize(
          event.target.result,
          'eng',
          { 
            logger: m => console.log(m),
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
          }
        );
        
        const text = result.data.text;
        console.log('OCR Result:', text);
        
        const potentialVins = extractPotentialVins(text);
        
        if (potentialVins.length > 0) {
          const validVin = potentialVins.find(validateVin);
          
          if (validVin) {
            setCurrentVin(validVin);
            setError('');
          } else {
            setError('No valid VIN found in image. Try again.');
          }
        } else {
          setError('No VIN-like pattern found. Try again.');
        }
      } catch (err) {
        setError('Failed to process image. Try again.');
        console.error('OCR error:', err);
      }
      
      setScanning(false);
    };
    
    reader.readAsDataURL(file);
  };

  // Save current VIN to the list
  const saveVin = () => {
    if (currentVin && validateVin(currentVin)) {
      const timestamp = new Date().toISOString();
      setVins([...vins, { vin: currentVin, timestamp }]);
      setCurrentVin('');
      
      // Also save to localStorage for persistence
      const savedVins = JSON.parse(localStorage.getItem('savedVins') || '[]');
      localStorage.setItem('savedVins', JSON.stringify([
        ...savedVins, 
        { vin: currentVin, timestamp }
      ]));
    }
  };

  // Load saved VINs on initial render
  useEffect(() => {
    const savedVins = JSON.parse(localStorage.getItem('savedVins') || '[]');
    setVins(savedVins);
  }, []);

  // Export to CSV
  const exportToCSV = () => {
    if (vins.length === 0) {
      setError('No VINs to export');
      return;
    }
    
    const csvContent = [
      'VIN,Timestamp',
      ...vins.map(v => `${v.vin},${v.timestamp}`)
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `vin_export_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle manual input of VIN
  const handleVinInput = (e) => {
    setCurrentVin(e.target.value.toUpperCase());
  };

  // Delete a VIN from the list
  const deleteVin = (index) => {
    const newVins = [...vins];
    newVins.splice(index, 1);
    setVins(newVins);
    localStorage.setItem('savedVins', JSON.stringify(newVins));
  };

  return (
    <div className="app-container">
      <h1>VIN Scanner</h1>
      
      <div className="scan-container">
        {!showCamera ? (
          <button className="action-button" onClick={startCamera}>
            Open Camera
          </button>
        ) : (
          <div className="camera-container">
            <video 
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="video-preview"
            />
            <div className="camera-controls">
              <button 
                className="action-button camera-button"
                onClick={captureImage}
                disabled={scanning}
              >
                {scanning ? 'Processing...' : 'Capture VIN'}
              </button>
              <button className="action-button cancel-button" onClick={stopCamera}>
                Close Camera
              </button>
            </div>
          </div>
        )}
        
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        
        <div className="upload-container">
          <p>Or upload an image of a VIN:</p>
          <input 
            type="file" 
            accept="image/*" 
            onChange={handleFileUpload}
            disabled={scanning}
          />
        </div>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      <div className="vin-input-container">
        <input
          type="text"
          placeholder="Enter VIN manually or from scan"
          value={currentVin}
          onChange={handleVinInput}
          maxLength={17}
          className="vin-input"
        />
        <button 
          className="action-button save-button"
          onClick={saveVin}
          disabled={!currentVin || !validateVin(currentVin)}
        >
          Save VIN
        </button>
      </div>
      
      <div className="vin-list-container">
        <h2>Saved VINs ({vins.length})</h2>
        {vins.length > 0 ? (
          <>
            <ul className="vin-list">
              {vins.map((item, index) => (
                <li key={index} className="vin-item">
                  <div className="vin-info">
                    <span className="vin-number">{item.vin}</span>
                    <span className="vin-timestamp">{new Date(item.timestamp).toLocaleString()}</span>
                  </div>
                  <button className="delete-button" onClick={() => deleteVin(index)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
            <button className="action-button export-button" onClick={exportToCSV}>
              Export to CSV
            </button>
          </>
        ) : (
          <p>No VINs saved yet. Scan or enter a VIN to get started.</p>
        )}
      </div>
    </div>
  );
}

export default App;