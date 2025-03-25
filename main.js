import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

// Configuración de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyAJhvXylzLwT1LEi9uAdlI33b08gZdPMh8",
  authDomain: "webrtc-3b6a4.firebaseapp.com",
  projectId: "webrtc-3b6a4",
  storageBucket: "webrtc-3b6a4.firebasestorage.app",
  messagingSenderId: "443033077034",
  appId: "1:443033077034:web:2fe3cb79f40377b1bd0a53"
};

// Inicializar Firebase si no está inicializado
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

// Configuración de servidores STUN para WebRTC
const servers = {
  iceServers: [
    {
      // Servidores STUN de Google
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Crear una conexión peer-to-peer usando WebRTC
const pc = new RTCPeerConnection(servers);  // Conexión WebRTC

let localStream = null;
let remoteStream = null;

// Elementos del DOM
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');

// 1. Obtener medios del usuario (cámara y micrófono)
webcamButton.onclick = async () => {
  // Solicitar acceso a la cámara y el micrófono
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();  // Crear un nuevo flujo para los medios remotos

  // Agregar las pistas de medios locales a la conexión WebRTC
  localStream.getTracks().forEach((track) => {
    // Cada pista de audio/video local se agrega a la conexión
    pc.addTrack(track, localStream);
  });

  // Cuando se recibe una pista remota, agregarla al flujo remoto
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);  // Pistas del peer remoto se agregan al flujo remoto
    });
  };

  // Mostrar el flujo local en el video local
  webcamVideo.srcObject = localStream;
  // Mostrar el flujo remoto en el video remoto
  remoteVideo.srcObject = remoteStream;

  // Habilitar botones para hacer y recibir llamadas
  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Crear una oferta de llamada
callButton.onclick = async () => {
  // Crear un documento para la llamada en Firestore
  const callDoc = firestore.collection('calls').doc();
  // Colección para candidatos ICE de la oferta
  const offerCandidates = callDoc.collection('offerCandidates');
  // Colección para candidatos ICE de la respuesta
  const answerCandidates = callDoc.collection('answerCandidates');

  // Mostrar el ID de la llamada en el input
  callInput.value = callDoc.id;

  // Manejo de candidatos ICE para la oferta
  pc.onicecandidate = (event) => {
    // Agregar los candidatos ICE al documento de la oferta
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Crear la oferta de llamada WebRTC
  const offerDescription = await pc.createOffer();
  // Establecer la descripción local (SDP)
  await pc.setLocalDescription(offerDescription);

  // Guardar la oferta en Firestore
  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  // Guardar la oferta en Firestore
  await callDoc.set({ offer });

  // Escuchar la respuesta remota (cuando llega la descripción de la respuesta)
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      // Crear una descripción de la respuesta
      const answerDescription = new RTCSessionDescription(data.answer);
      // Establecer la descripción remota (respuesta)
      pc.setRemoteDescription(answerDescription);
    }
  });

  // Cuando se recibe un candidato ICE de la respuesta, se agrega a la conexión
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());  // Crear un candidato ICE
        pc.addIceCandidate(candidate);  // Agregar el candidato a la conexión
      }
    });
  });

  // Habilitar botón para colgar la llamada
  hangupButton.disabled = false;
};

// 3. Responder la llamada con el ID único
answerButton.onclick = async () => {
  // Obtener el ID de la llamada desde el input
  const callId = callInput.value;
  // Obtener el documento de la llamada en Firestore
  const callDoc = firestore.collection('calls').doc(callId);
  // Colección para candidatos ICE de la respuesta
  const answerCandidates = callDoc.collection('answerCandidates');
  // Colección para candidatos ICE de la oferta
  const offerCandidates = callDoc.collection('offerCandidates');

  // Manejo de candidatos ICE para la respuesta
  pc.onicecandidate = (event) => {
    // Agregar los candidatos ICE de la respuesta
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  // Obtener la oferta de llamada desde Firestore
  const callData = (await callDoc.get()).data();
  const offerDescription = callData.offer;
  // Establecer la descripción remota (oferta)
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  // Crear la respuesta de la llamada WebRTC
  const answerDescription = await pc.createAnswer();
  // Establecer la descripción local (respuesta)
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  // Guardar la respuesta en Firestore
  await callDoc.update({ answer });

  // Cuando se reciben candidatos ICE de la oferta, se agregan a la conexión
  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        let data = change.doc.data();
        // Agregar candidatos ICE de la oferta
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
};