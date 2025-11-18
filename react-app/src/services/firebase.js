import { initializeApp } from "firebase/app";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  push,
  child,
  get,
} from "firebase/database";

// Configuração do Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAdxw1I-E-esZVGfhoop-yehIo1TN3jztc",
  authDomain: "scatambulo-d7cf2.firebaseapp.com",
  projectId: "scatambulo-d7cf2",
  storageBucket: "scatambulo-d7cf2.firebasestorage.app",
  messagingSenderId: "793542611290",
  appId: "1:793542611290:web:2ff447165151dc92d6a363",
  measurementId: "G-CVH2148FPB",
  databaseURL: "https://scatambulo-d7cf2-default-rtdb.firebaseio.com/",
};

// Inicializa o app e banco
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Exporta o db e as funções do Firebase para os outros módulos
export { db, ref, set, update, onValue, push, child, get };
