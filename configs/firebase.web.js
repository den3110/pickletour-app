// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCrI3fGlm3WA1bzT2yIn1ZtLcFJTSloO8E",
  authDomain: "call-e7189.firebaseapp.com",
  databaseURL: "https://call-e7189-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "call-e7189",
  storageBucket: "call-e7189.appspot.com",
  messagingSenderId: "729938965315",
  appId: "1:729938965315:web:a3abf2da46b0a7397af5f6",
  measurementId: "G-JZJHW4TDM8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics
let analytics;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

export { app, analytics };