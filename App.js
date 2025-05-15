import React, { useRef, useState } from "react";
import Webcam from "react-webcam";
import AWS from "aws-sdk";
import axios from "axios";
import "./App.css";

// AWS konfigurácia
AWS.config.update({
  region: "us-east-1", // Napríklad "us-east-1"
  accessKeyId: "AKIAUPMYNME2LELSTS6A",
  secretAccessKey: "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",
});

const s3 = new AWS.S3();

const App = () => {
  const webcamRef = useRef(null);
  const [file, setFile] = useState(null);
  const [fullName, setFullName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [capturedImage, setCapturedImage] = useState(null);
  const [results, setResults] = useState([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [darkMode, setDarkMode] = useState(true);

  // Prepínanie medzi darkMode a lightMode
  const toggleMode = () => {
    setDarkMode((prev) => !prev);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const droppedFile = event.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith("image/")) {
      setFile(droppedFile);
      setErrorMessage("");
      setSuccessMessage("");
    } else {
      setErrorMessage("Please upload a valid image file.");
    }
  };

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile && selectedFile.type.startsWith("image/")) {
      setFile(selectedFile);
      setErrorMessage("");
      setSuccessMessage("");
    } else {
      setErrorMessage("Please select a valid image file.");
    }
  };

  const uploadToS3 = async () => {
    if (!file || !fullName) {
      setErrorMessage("Both name and image are required.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("fullName", fullName);

    try {
      const response = await axios.post("http://127.0.0.1:5000/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.status === 200) {
        setSuccessMessage("File uploaded successfully!");
        setFile(null);
        setFullName("");
        setIsAuthenticated(true);
        console.log("Uploaded file:", response.data.filename);
      } else {
        setErrorMessage("Failed to upload the file.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      setErrorMessage("Error uploading to S3. Please try again.");
    }
  };

  const captureImage = async () => {
    const imageSrc = webcamRef.current.getScreenshot();
    if (!imageSrc) {
      setErrorMessage("Error capturing image.");
      return;
    }

    setCapturedImage(imageSrc);

    try {
      const response = await axios.post("http://127.0.0.1:5000/compare", {
        image: imageSrc,
      });

      if (response.status === 200 && response.data.status === "success") {
        const results = response.data.results || [];
        if (results.length > 0) {
          setResults(results);
          setErrorMessage("");
        } else {
          setResults([]);
          setErrorMessage("No face matches found.");
        }
      } else if (response.status === 400) {
        if (response.data.message === "Possible photo detected. Liveness check failed") {
          setErrorMessage("Liveness check failed. Ensure you're using a real face and not a photo.");
        } else if (response.data.message === "No faces detected in the image") {
          setErrorMessage("There are no faces in the image.");
        } else {
          setErrorMessage(response.data.message || "An error occurred while processing.");
        }
        setResults([]);
      } else {
        setResults([]);
        setErrorMessage("Unexpected server response.");
      }
    } catch (error) {
      if (error.response && error.response.status === 400) {
        const serverMessage = error.response.data.message || "Error detected.";
        setErrorMessage(serverMessage);
      } else {
        setErrorMessage("Error connecting to the server.");
      }
      setResults([]);
    }
  };

  return (
    <div className={`app ${darkMode ? "dark-mode" : "light-mode"}`}>
      <header className="header">
        <div className="header-left">
          <button
            className={`nav-button ${darkMode ? "night" : "day"}`}
            onClick={() => setIsAuthenticated(!isAuthenticated)}
          >
            {isAuthenticated ? "🡸" : "🡺"}
          </button>
        </div>
        <div className="header-center">
          <h1>{isAuthenticated ? "Face Recognition" : "User Registration"}</h1>
        </div>
        <div className="header-right">
          <button
            className={`toggle-button ${darkMode ? "night" : "day"}`}
            onClick={toggleMode}
          >
            {darkMode ? "☀️ DAY MODE" : "NIGHT MODE 🌙"}
          </button>
        </div>
      </header>

      <main className="main">
        {!isAuthenticated ? (
          <div className="registration-form">
            <div
              className="drop-zone"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
            >
              {file ? (
                <img
                  src={URL.createObjectURL(file)}
                  alt="Preview"
                  className="preview-image"
                />
              ) : (
                <p>Drag and drop an image here, or click to select one</p>
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="file-input"
              />
            </div>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Enter your full name"
              className="text-input"
            />
            <button className="capture-button" onClick={uploadToS3}>
              Upload Image and Register
            </button>
            <button
              className="secondary-button"
              onClick={() => setIsAuthenticated(true)}
            >
              Already Registered? Authenticate
            </button>
            {errorMessage && <p className="error-message">{errorMessage}</p>}
            {successMessage && <p className="success-message">{successMessage}</p>}
          </div>
        ) : (
          <>
            <div className="camera-and-image-container">
              <div className="webcam-container">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                />
              </div>
              <div className="captured-image">
                {capturedImage && <img src={capturedImage} alt="Captured" />}
              </div>
            </div>
            <button className="capture-button" onClick={captureImage}>
              Capture and Compare
            </button>
            {errorMessage && <p className="error-message">{errorMessage}</p>}
            <div className="results-container">
              {results.length > 0 ? (
                <ul>
                  {results.map((result, index) => (
                    <li key={index} className="result-item">
                      <div>
                        <strong>Name:</strong> {result.name}
                      </div>
                      <div>
                        <strong>Match:</strong> {parseFloat(result.confidence).toFixed(3)}%
                      </div>
                      <div>
                        <strong>Gender:</strong> {result.gender}
                      </div>
                      <div>
                        <strong>Age Range:</strong> {result.age_range}
                      </div>
                      <div>
                        <strong>Emotion:</strong> {result.emotion.type} (
                        {result.emotion.confidence.toFixed(2)}%)
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                !errorMessage && <p>No matches found.</p>
              )}
            </div>
          </>
        )}
      </main>

      <footer className="footer">
        <p>© 2025 Jakub Bajo, Powered by AWS Rekognition</p>
      </footer>
    </div>
  );
};

export default App;
