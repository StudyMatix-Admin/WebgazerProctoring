let lives = 20;
let awayFrames = 0;
let testStarted = false;
let calibClicks = 0;
let collectedGaze = [];
const gazePoints = [];
const clickedCalibrationPoints = new Set();
const livesDisplay = document.getElementById('lives');
const testSection = document.getElementById("testSection");
const heatmapCanvas = document.getElementById('heatmapCanvas');
const heat = simpleheat('heatmapCanvas').radius(20, 25);
let noGazeFrames = 0;
let lastFaceSeenTime = Date.now();
let testId = null;

// Setup MediaPipe Face Detection
const videoEl = document.getElementById("webcamPreview");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
// Initialize MediaPipe Face Detection
const faceMesh = new FaceMesh({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
});
faceMesh.setOptions({
  maxNumFaces: 1,
  refineLandmarks: true,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5
});

faceMesh.onResults(onFaceMeshResults);
const cam = new Camera(videoEl, {
  onFrame: async () => {
    //await faceDetection.send({ image: videoEl });
    await faceMesh.send({ image: videoEl });
  },
  width: 640,
  height: 480
});
cam.start();


function drawLandmarks(landmarks) {
  ctx.strokeStyle = "lime";
  ctx.lineWidth = 2;
  for (const point of landmarks) {
    const x = point.x * overlay.width;
    const y = point.y * overlay.height;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, 2 * Math.PI);
    ctx.stroke();
  }
}
// ----------------------------
// Fullscreen + Calibration
// ----------------------------

window.onload = () => {
  document.getElementById("fullscreenBtn").addEventListener("click", async () => {
  try {
    // Ask for camera permission first
    await navigator.mediaDevices.getUserMedia({ video: true });

    // Now request fullscreen
    const elem = document.documentElement;
    await (elem.requestFullscreen?.() || elem.webkitRequestFullscreen?.() || elem.msRequestFullscreen?.());

    document.getElementById("fullscreenBtn").style.display = "none";
    document.getElementById("calibrationUI").style.display = "block";

    // Start WebGazer
    webgazer
      .showVideo(false)
      .showFaceOverlay(false)
      .showFaceFeedbackBox(false)
      .begin();
      setTimeout(() => {
  const calibUI = document.getElementById("calibrationUI");
  calibUI.style.opacity = "1";
  calibUI.style.visibility = "visible";
  calibUI.style.pointerEvents = "auto";
  attachCalibrationHandlers();
}, 1500); // give it a bit of time to ensure camera loads

    //attachCalibrationHandlers();

  } catch (err) {
    showCustomAlert("Camera access or fullscreen request was blocked.");
    console.error(err);
  }
});

};


document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) {
    handleViolation("Exited fullscreen mode");
  }
});

function hideWebgazerFeed() {
  //const wgFeed = document.getElementById('webgazerVideoFeed');
  //if (wgFeed) wgFeed.style.display = 'none';
 // else setTimeout(hideWebgazerFeed, 500);
}

function attachCalibrationHandlers() {
  ['calib-tl', 'calib-tr', 'calib-bl', 'calib-br'].forEach(id => {
    const box = document.getElementById(id);
    if (box) {
      box.addEventListener('click', () => collectCalibrationPoint(id));
    }
  });
}

function collectCalibrationPoint(id) {
  if (clickedCalibrationPoints.has(id)) return;

  clickedCalibrationPoints.add(id);
  const box = document.getElementById(id);
  box.style.backgroundColor = 'green';

  // Get center of box
  const boxRect = box.getBoundingClientRect();
  const centerX = boxRect.left + boxRect.width / 2;
  const centerY = boxRect.top + boxRect.height / 2;

  // Record multiple gaze points
  const interval = setInterval(() => {
    webgazer.recordScreenPosition(centerX, centerY, 'click');
  }, 100);

  setTimeout(() => {
    clearInterval(interval);

    console.log("Clicked calibration points:", clickedCalibrationPoints.size);

    if (clickedCalibrationPoints.size === 4) {
      console.log("Calibration complete.");

      webgazer.showVideo(false);
      hideWebgazerFeed();

      document.getElementById('calibrationScreen').style.display = 'none';

      const startBtn = document.getElementById('startTest');
      startBtn.disabled = false;
      startBtn.style.display = 'inline-block';

      showCustomAlert("Calibration complete. You may now begin the test.");
    }
  }, 1000);
}

// ----------------------------
// Violation Handler
// ----------------------------
function handleViolation(reason) {
  lives -= 1;
  livesDisplay.textContent = lives;
  showCustomAlert(`Violation: ${reason}. Lives left: ${lives}`);
  if (lives <= 0) {
    showCustomAlert("Test cancelled due to multiple violations.");
    window.location.reload();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && testStarted) {
    handleViolation("Tab switch detected");
  }
});

// ----------------------------
// Start Test Logic
// ----------------------------
document.getElementById('startTest').addEventListener('click', async () => {
  testStarted = true;
  const indexInput = document.getElementById("testIndexInput").value;
  const testIndex = indexInput ? parseInt(indexInput) : null;
  console.log("Test index:", testIndex);
  showCustomAlert("Test starting now. Stay focused on the screen.");
  testSection.style.display = 'block';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    document.getElementById('webcamPreview').srcObject = stream;
  } catch (err) {
    console.error("Webcam error:", err);
  }

webgazer.setGazeListener((data, timestamp) => {
  if (!data) {
   
    return;
  }


  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  const canvasWidth = heatmapCanvas.width;
  const canvasHeight = heatmapCanvas.height;

  // Rescale the full-screen gaze point to canvas size
  const scaledX = (data.x / screenWidth) * canvasWidth;
  const scaledY = (data.y / screenHeight) * canvasHeight;

  // Push point if it's within bounds
  if (
    scaledX >= 0 && scaledX <= canvasWidth &&
    scaledY >= 0 && scaledY <= canvasHeight
  ) {
    gazePoints.push([scaledX, scaledY, 0.01]); // Lower intensity
    if (gazePoints.length > 1000) gazePoints.shift();
    heat.data(gazePoints).draw(0.001); // Light opacity
  }

  // Check if gaze is too far from screen center
  const buffer = 80;
  const isLookingAway =
    data.x < buffer ||
    data.x > screenWidth - buffer ||
    data.y < buffer ||
    data.y > screenHeight - buffer;

  awayFrames = isLookingAway ? awayFrames + 1 : 0;

  if (awayFrames >= 20) {
    handleViolation("User appears to be looking away from the screen");
    awayFrames = 0;
  }
    const startBtn = document.getElementById('startTest');
    const indexInput = document.getElementById('testIndexInput');
    startBtn.disabled = true;
    indexInput.disabled = true;
    startBtn.classList.add('disabled-style');
    indexInput.classList.add('disabled-style');
});


webgazer.showPredictionPoints(true);

const url = testIndex !== null
  ? `https://studymatix-chat-app-429296191342.asia-south1.run.app/gettest?index=${testIndex}`
  : `https://studymatix-chat-app-429296191342.asia-south1.run.app/gettest`;

fetch(url)
  .then(res => res.json())
  .then(data => {
    testId = data._id; // Store the test ID here
    const container = document.getElementById("questions");
    container.innerHTML = ""; // Clear any previous test content
    console.log(url);
    console.log("Test ID:", testId);
    data.questions.forEach((q, index) => {
      const div = document.createElement('div');
      div.className = 'question';

      const codeBlock = q.code
        ? `<pre style="background:#f0f0f0;padding:10px;border-radius:4px;"><code>${q.code}</code></pre>`
        : '';

      const optionsHTML = Object.entries(q.options).map(([key, value]) =>
        `<label><input type="radio" name="q${index}" value="${key}"/> ${key}: ${value}</label><br>`
      ).join('');

      div.innerHTML = `
        <p><strong>Q${index + 1}:</strong> ${q.question}</p>
        ${codeBlock}
        ${optionsHTML}
      `;
      container.appendChild(div);
    });
  })
  .catch(err => {
    console.error("Fetch error:", err);
    container.innerHTML = "<p>Failed to load questions. Try again later.</p>";
  });
});

// ----------------------------
// Submit Answers
// ----------------------------
document.getElementById("submitBtn").addEventListener("click", () => {
  const questions = document.querySelectorAll(".question");
  const answers = {};

  questions.forEach((q, i) => {
    const selected = q.querySelector(`input[name="q${i}"]:checked`);
    answers[`q${i}`] = selected ? selected.value : null;
  });

  if (!testId) {
    showCustomAlert("Test ID missing. Cannot submit.");
    return;
  }

  fetch('https://studymatix-chat-app-429296191342.asia-south1.run.app/submittest', {

    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      testId: testId, // Include the test ID here
      answers: answers
    })
  })
  .then(res => {
    if (res.ok) {
  showCustomAlert("Test completed successfully.");

  setTimeout(() => {
    // Exit fullscreen
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    }

    // Remove questions and submit button
    document.getElementById("questionsContainer")?.remove();
    document.getElementById("submitBtn")?.remove();

    // Hide test section
    testSection.style.display = 'none';

    // Show completion message
    const completedMsg = document.createElement("div");
    completedMsg.textContent = "✅ Test Completed";
    completedMsg.style.fontSize = "24px";
    completedMsg.style.color = "green";
    completedMsg.style.textAlign = "center";
    completedMsg.style.marginTop = "40px";
    document.body.appendChild(completedMsg);

    // Stop webcam
    const stream = videoEl.srcObject;
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    videoEl.srcObject = null;

  }, 2000);
}
    else showCustomAlert("Submission failed.");
  })
  .catch(() => showCustomAlert("Error submitting answers."));
});

function isLookingAway(x, y, screenWidth, screenHeight) {
  const buffer = 80;
  return (
    x < buffer ||
    x > screenWidth - buffer ||
    y < buffer ||
    y > screenHeight - buffer
  );
}

let faceAwayStartTime = null;

function onFaceMeshResults(results) {
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  const now = Date.now();

  if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
    const landmarks = results.multiFaceLandmarks[0];
    drawLandmarks(landmarks);

    const leftEye = landmarks[133];
    const rightEye = landmarks[362];
    const nose = landmarks[1];

    const dxLeft = Math.abs(leftEye.x - nose.x);
    const dxRight = Math.abs(rightEye.x - nose.x);
    const lookingAway = dxLeft > 0.07 || dxRight > 0.07;

    if (lookingAway) {
      if (!faceAwayStartTime) {
        faceAwayStartTime = now;
      } else if (now - faceAwayStartTime >= 3000 && testStarted) {
        handleViolation("Face appears to be turned away for over 3 seconds");
        faceAwayStartTime = now; // update to prevent repeated immediate violations
      }
    } else {
      faceAwayStartTime = null; // reset if user looks back
    }

    lastFaceSeenTime = now;
  } else {
    if (now - lastFaceSeenTime > 3000 && testStarted) {
      handleViolation("Face not detected for over 3 seconds");
      lastFaceSeenTime = now;
    }
  }
}

function showCustomAlert(message, duration = 3000) {
  const alertBox = document.getElementById("customAlert");
  alertBox.textContent = message;
  alertBox.style.display = "block";

  setTimeout(() => {
    alertBox.style.display = "none";
  }, duration);
}
