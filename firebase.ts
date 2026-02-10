
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBFgFHavdorEXinN6gA5dRTGtH-wJ-tXi8",
  authDomain: "mytest-80f6f.firebaseapp.com",
  projectId: "mytest-80f6f",
  storageBucket: "mytest-80f6f.firebasestorage.app",
  messagingSenderId: "255568141960",
  appId: "1:255568141960:web:6900ecb414c318457c093d",
  measurementId: "G-9Y3K63YY2X"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Analytics is optional
let analytics;
try {
  analytics = getAnalytics(app);
} catch (e) {
  console.warn("Analytics initialization failed:", e);
}

export { auth, db, storage, analytics };
