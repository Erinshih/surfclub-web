
import {
  getStorage
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";

import {
    getAuth
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
    getFirestore
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// const firebaseConfig = {
//     apiKey: "請貼上畫面中的值",
//     authDomain: "surfclub-web.firebaseapp.com",
//     projectId: "surfclub-web",
//     storageBucket: "surfclub-web.firebasestorage.app",
//     messagingSenderId: "請貼上畫面中的值",
//     appId: "請貼上畫面中的值",
//     measurementId: "請貼上畫面中的值"
// };

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB46lAu74NckOxoILFFg_SjA4OKHllKe2k",
  authDomain: "surfclub-web.firebaseapp.com",
  projectId: "surfclub-web",
  storageBucket: "surfclub-web.firebasestorage.app",
  messagingSenderId: "36700080019",
  appId: "1:36700080019:web:44799b0e11befdee074a66",
  measurementId: "G-EQX9K9DSXF"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);