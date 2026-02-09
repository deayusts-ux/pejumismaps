import { useState, useEffect, useRef } from 'react';
import QRCode from "react-qr-code";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import mqtt from 'mqtt'; // MQTT for Real-time Tracking

// Fix Leaflet Default Icon Issues
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

const ZenMapLogo = ({ className = "w-12 h-12" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="100" height="100" rx="25" fill="#0F141C" />
    <circle cx="50" cy="50" r="35" stroke="#334155" strokeWidth="2" />
    <path d="M15 50H85" stroke="#334155" strokeWidth="2" strokeOpacity="0.5" />
    <path d="M50 15V85" stroke="#334155" strokeWidth="2" strokeOpacity="0.5" />
    <path d="M25 30C40 30 50 50 75 45" stroke="#FAFF00" strokeWidth="4" strokeLinecap="round" strokeDasharray="6 6" />
    <circle cx="25" cy="30" r="4" fill="#FAFF00" />
    <circle cx="75" cy="45" r="4" fill="#FAFF00" />
  </svg>
);

function App() {
  // Check for existing session
  const hasStoredUser = !!localStorage.getItem('zenmap_username');

  const [currentView, setCurrentView] = useState(hasStoredUser ? 'map' : 'landing');
  const [phoneNumber, setPhoneNumber] = useState(() => localStorage.getItem('zenmap_phone') || '');
  const [userName, setUserName] = useState(() => localStorage.getItem('zenmap_username') || '');

  const [profileImage, setProfileImage] = useState(() => localStorage.getItem('zenmap_avatar'));
  const fileInputRef = useRef(null);

  // Persist User Credentials and Avatar
  useEffect(() => {
    localStorage.setItem('zenmap_phone', phoneNumber);
    localStorage.setItem('zenmap_username', userName);
    if (profileImage) {
      localStorage.setItem('zenmap_avatar', profileImage);
    }
  }, [phoneNumber, userName, profileImage]);

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImage(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const [isTracking, setIsTracking] = useState(false);
  const [userLocation, setUserLocation] = useState({ lat: -6.2088, lng: 106.8456 }); // Jakarta
  const [zoom, setZoom] = useState(15);
  const [isSharing, setIsSharing] = useState(hasStoredUser); // Auto-share if returning
  const [isQRVisible, setIsQRVisible] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Mobile Sidebar State

  // Room ID Logic for Private Sessions
  const [roomId, setRoomId] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) return hash;
    const newRoomId = Math.random().toString(36).substr(2, 6).toUpperCase();
    window.location.hash = newRoomId;
    return newRoomId;
  });

  const isFormValid = userName.trim().length > 0; // Only Name is required now

  // Update URL Hash if Room ID changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== roomId) setRoomId(hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [roomId]);

  // Real-time Multi-user Tracking State
  const [otherUsers, setOtherUsers] = useState({});
  const [myId] = useState(() => {
    const storedId = localStorage.getItem('zenmap_device_id');
    if (storedId) return storedId;
    const newId = 'user-' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('zenmap_device_id', newId);
    return newId;
  });
  const [client, setClient] = useState(null);

  // Toast State
  const [toast, setToast] = useState(null);
  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Chat State
  const [chatMessages, setChatMessages] = useState([]);
  const [activeTab, setActiveTab] = useState('users'); // 'users' | 'chat'
  const [messageInput, setMessageInput] = useState('');
  const messagesEndRef = useRef(null); // Auto-scroll to bottom

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (activeTab === 'chat') scrollToBottom();
  }, [chatMessages, activeTab]);


  const handleNext = () => {
    if (!userName.trim()) {
      showToast("Please enter your name", "error");
      return;
    }

    // Check for Geolocation Support
    if (!navigator.geolocation) {
      showToast("Geolocation is not supported by this browser.", "error");
      return;
    }

    // Force update URL hash to current input value
    if (roomId) window.location.hash = roomId;

    setIsTracking(true);

    // Simpler Transition Logic
    setTimeout(() => {
      setIsTracking(false);
      setCurrentView('map');
      // Ensure mobile view scroll resets
      window.scrollTo(0, 0);

      // Enable sharing after view switch
      requestAnimationFrame(() => {
        setIsSharing(true);
      });
    }, 500);
  };

  // Real-time Geolocation Implementation
  useEffect(() => {
    let watchId;

    if (isSharing && navigator.geolocation) {
      // Start watching position
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });

          // Optional: Auto-center on first location update if needed, 
          // but keeping manual recenter is usually better UX for maps.
        },
        (error) => {
          console.error("Error getting location:", error);
          // Fallback logic could go here (e.g. show toast notification)
          alert("Unable to retrieve your location. Please ensure location services are enabled.");
          setIsSharing(false); // Stop sharing on error
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0
        }
      );
    } else if (!isSharing && watchId) {
      navigator.geolocation.clearWatch(watchId);
    }

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, [isSharing]);

  // Ref untuk akses lokasi dan nama terkini di dalam event listener MQTT
  const userLocationRef = useRef(null);
  const userNameRef = useRef(userName);

  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);

  useEffect(() => {
    userNameRef.current = userName;
  }, [userName]);

  // MQTT Connection & Handling
  useEffect(() => {
    if (!roomId) return;

    // Connect to public broker via WebSocket (Secure WSS is required for HTTPS)
    // HiveMQ Public Broker WSS Port is 8884
    const mqttClient = mqtt.connect('wss://broker.hivemq.com:8884/mqtt', {
      clientId: myId + Math.random().toString(16).substr(2, 4), // Unique client ID
      reconnectPeriod: 1000,
      connectTimeout: 5000,
      // Last Will & Testament: Automatically remove user if connection breaks
      will: {
        topic: `zenmap/${roomId}/${myId}`,
        payload: '', // Empty payload deletes the user
        retain: true,
        qos: 1
      }
    });

    mqttClient.on('error', (err) => {
      console.error('MQTT Connection Error:', err);
      // Optional: Update UI to show error state if needed
      setClient(null);
    });

    mqttClient.on('connect', () => {
      console.log('Connected to MQTT Broker, Room:', roomId);
      setClient(mqttClient);

      // Subscribe to EVERYONE in this room
      // Structure: zenmap/{roomId}/{userId}
      mqttClient.subscribe(`zenmap/${roomId}/#`, (err) => {
        if (!err) {
          console.log(`Subscribed to zenmap/${roomId}/#`);
          // FAST JOIN: Announce presence immediately!
          const nameToSend = userNameRef.current || 'User ' + myId.substr(-4);
          const joinPayload = JSON.stringify({
            type: 'join',
            id: myId,
            name: nameToSend
          });
          mqttClient.publish(`zenmap/${roomId}/${myId}`, joinPayload, { qos: 0 });
        } else {
          console.error('Subscription error:', err);
        }
      });
    });

    mqttClient.on('message', (topic, message) => {
      // topic format: zenmap/{roomId}/{userId}
      const parts = topic.split('/');
      // Expecting: zenmap, ROOMID, USERID
      if (parts.length < 3) return;

      const senderId = parts[2];
      const senderRoom = parts[1];

      // Ensure message is for this room (double check) and not from self
      if (senderRoom !== roomId || senderId === myId) return;

      // Clear user if payload is empty (Retained message cleared)
      if (message.toString().length === 0) {
        setOtherUsers(prev => {
          const next = { ...prev };
          delete next[senderId];
          return next;
        });
        return;
      }

      try {
        const payload = JSON.parse(message.toString());

        // Handle FAST JOIN REQUEST
        // If someone new joins, immediately send them my location!
        if (payload.type === 'join') {
          if (userLocationRef.current) {
            const nameToSend = userNameRef.current || 'User ' + myId.substr(-4);
            const replyPayload = JSON.stringify({
              lat: userLocationRef.current.lat,
              lng: userLocationRef.current.lng,
              name: nameToSend,
              avatarSeed: myId
            });
            // Publish immediately (response)
            mqttClient.publish(`zenmap/${roomId}/${myId}`, replyPayload, { retain: true, qos: 0 });
          }
          return;
        }

        // Handle KICK command
        if (payload.type === 'kick' && payload.targetId === myId) {
          showToast("You have been kicked from the room.", 'error');
          localStorage.removeItem('zenmap_username'); // Clear session
          window.location.hash = ''; // Clear hash
          setTimeout(() => window.location.reload(), 2000); // Reload to landing after toast
          return;
        }

        // Handle CHAT message
        if (payload.type === 'chat') {
          setChatMessages(prev => {
            // Avoid duplicates if latency causes re-delivery (optional check)
            if (prev.some(m => m.id === payload.id)) return prev;
            return [...prev, {
              ...payload,
              senderId,
              isMe: senderId === myId
            }];
          });
          return;
        }

        // Ignore if it's a system message not meant for state update (like kick)
        if (payload.type === 'kick') return;

        // SAFETY CHECK: Ensure payload has valid coordinates to prevent Map Crash
        if (!payload.lat || !payload.lng) return;

        setOtherUsers(prev => ({
          ...prev,
          [senderId]: {
            ...payload,
            lastSeen: Date.now()
          }
        }));
      } catch (e) {
        console.error('Error parsing MQTT message:', e);
      }
    });

    return () => {
      if (mqttClient) mqttClient.end();
    };
  }, [myId, roomId]);

  // Publish Location Updates
  useEffect(() => {
    if (isSharing && client && userLocation) {
      const payload = JSON.stringify({
        lat: userLocation.lat,
        lng: userLocation.lng,
        name: userName || 'User ' + myId.substr(-4),
        avatarSeed: myId // Consistent avatar
      });

      // Publish to PRIVATE room
      if (roomId) client.publish(`zenmap/${roomId}/${myId}`, payload, { retain: true, qos: 0 });
    }
  }, [isSharing, userLocation, client, myId, roomId, userName]);

  // Sound Effects
  useEffect(() => {
    // Preload sounds
    const chatSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3'); // Pop
    const joinSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3'); // Bell

    // Play chat sound on new message (if not from me)
    if (chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      if (!lastMsg.isMe) {
        chatSound.volume = 0.5;
        chatSound.play().catch(e => console.log('Audio play failed', e));
      }
    }
  }, [chatMessages]);

  // Track previous users count to detect join
  const prevUsersCount = useRef(0);
  useEffect(() => {
    const currentCount = Object.keys(otherUsers).length;
    if (currentCount > prevUsersCount.current) {
      const joinSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.mp3');
      joinSound.volume = 0.3;
      joinSound.play().catch(e => console.log('Audio play failed', e));
      showToast("A new user joined the map!", "info");
    }
    prevUsersCount.current = currentCount;
  }, [otherUsers]);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 1, 21));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 1, 3));

  const sendMessage = (e) => {
    e?.preventDefault();
    if (!messageInput.trim() || !client) return;

    const msgId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    const chatPaylaod = JSON.stringify({
      type: 'chat',
      id: msgId,
      name: userName || 'User ' + myId.substr(-4),
      text: messageInput.trim(),
      timestamp: Date.now()
    });

    // Publish to room
    client.publish(`zenmap/${roomId}/${myId}`, chatPaylaod, { qos: 0 });

    // Optimistic Update is tricky with MQTT loopback subscribe #. 
    // Since we ignore messages from self in on('message'), we MUST add it manually here.
    setChatMessages(prev => [...prev, {
      id: msgId,
      name: userName || 'User ' + myId.substr(-4),
      text: messageInput.trim(),
      timestamp: Date.now(),
      senderId: myId,
      isMe: true
    }]);

    setMessageInput('');
    setTimeout(scrollToBottom, 100);
  };

  const handleRecenter = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserLocation({ lat: latitude, lng: longitude });
          setZoom(17);
        },
        (error) => {
          console.error("Error getting location:", error);
          // Fallback to Jakarta if current location is unknown/default
          if (userLocation.lat === -6.2088) {
            alert("Could not access location. Please enable GPS permissions.");
          }
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  };

  const MapUpdater = ({ center, zoom }) => {
    const map = useMap();
    useEffect(() => {
      map.setView(center, zoom);
    }, [center, zoom, map]);
    return null;
  };

  const handlePhoneChange = (e) => {
    setPhoneNumber(e.target.value);
  };

  const isPhoneValid = phoneNumber.length > 9;

  return (
    <div className="bg-map-dark text-white font-display overflow-hidden h-[100dvh] w-full relative flex items-center justify-center">

      {/* BACKGROUND (Common for both views) */}
      <div className="absolute inset-0 w-full h-full map-bg z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/20 rounded-full blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-accent-pink/10 rounded-full blur-[100px]"></div>
      </div>

      {currentView === 'landing' && (
        <main className="relative z-10 w-full max-w-[1440px] px-8 md:px-16 flex flex-col md:flex-row items-center justify-between gap-12 h-full">
          {/* Left Section (Visuals/Map) */}
          <div className="flex-1 w-full flex items-center justify-center md:justify-start lg:pl-16 relative order-1 md:order-none">
            <div className="relative w-full max-w-[500px] aspect-square flex items-center justify-center">

              {/* Hyper-Realistic Composite Globe with New Logo Centered or as replacement */}
              {/* For now keeping the globe as background visual but adding logo as overlay badge */}
              <div className="relative w-[300px] h-[300px] md:w-[450px] md:h-[450px] rounded-full shadow-glow animate-float-slow z-10 overflow-hidden bg-[#000510]">
                {/* ... existing globe content ... */}
                <div className="absolute inset-0 bg-radial-gradient from-[#004e92] to-[#000428] opacity-80"></div>
                {/* ... existing globe content ... */}
                {/* Reusing existing implementation but putting Logo in center for effect? Or just replace the 📍 emoji */}
                <div
                  className="absolute inset-0 w-full h-full bg-cover animate-spin-earth"
                  style={{
                    backgroundImage: `url('https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Land_ocean_ice_2048.jpg/1024px-Land_ocean_ice_2048.jpg')`,
                    backgroundSize: '200% 100%'
                  }}
                ></div>

                {/* 3. Cloud Layer (Parallax Spin) */}
                <div
                  className="absolute inset-0 w-full h-full bg-cover animate-spin-cloud opacity-40 mix-blend-screen"
                  style={{
                    backgroundImage: `url('https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Earth_clouds_2048.jpg/1024px-Earth_clouds_2048.jpg')`,
                    backgroundSize: '200% 100%'
                  }}
                ></div>

                {/* 4. Inner Shadow (Night Side / Depth) */}
                <div className="absolute inset-0 rounded-full pointer-events-none"
                  style={{
                    boxShadow: 'inset 40px 0 80px rgba(0,0,0,0.8), inset -5px 0 20px rgba(255,255,255,0.2)'
                  }}>
                </div>

                {/* 5. Atmosphere Glow (Outer Rim) */}
                <div className="absolute inset-0 rounded-full bg-radial-gradient from-transparent via-transparent to-blue-400/20 pointer-events-none"></div>
              </div>

              {/* Orbiting Elements */}
              <div className="absolute inset-0 animate-spin [animation-duration:40s] pointer-events-none">
                <div className="absolute top-[-20px] left-1/2 -translate-x-1/2 pointer-events-auto">
                  <div className="w-14 h-14 md:w-20 md:h-20 rounded-full border-4 border-white bg-accent-pink shadow-lg flex items-center justify-center transform hover:scale-110 transition-transform bg-white">
                    <img alt="Friend 1" className="w-full h-full rounded-full object-cover" src="https://api.dicebear.com/9.x/avataaars/svg?seed=Felix&backgroundColor=b6e3f4" />
                  </div>
                </div>
              </div>

              <div className="absolute inset-0 animate-spin [animation-duration:50s] [animation-direction:reverse] pointer-events-none">
                <div className="absolute bottom-4 right-[-10px] md:right-[-20px] pointer-events-auto">
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-full border-4 border-white bg-accent-lime shadow-lg flex items-center justify-center transform hover:scale-110 transition-transform bg-white">
                    <img alt="Friend 2" className="w-full h-full rounded-full object-cover" src="https://api.dicebear.com/9.x/avataaars/svg?seed=Aneka&backgroundColor=ffdfbf" />
                  </div>
                </div>
              </div>

              <div className="absolute top-10 right-0 md:-right-10 bg-white/10 backdrop-blur-md p-3 md:p-4 rounded-xl rotate-12 animate-float-reverse shadow-float flex items-center justify-center">
                <ZenMapLogo className="w-12 h-12 md:w-16 md:h-16" />
              </div>

              <div className="absolute bottom-0 left-0 md:-left-10 bg-white/10 backdrop-blur-md p-3 md:p-4 rounded-full -rotate-6 animate-float-slow shadow-float">
                <span className="text-3xl md:text-4xl">🍦</span>
              </div>

            </div>
          </div>

          {/* Right Section (Text/Controls) */}
          <div className="flex-1 w-full max-w-md lg:max-w-lg flex flex-col justify-center gap-8 md:pr-16 lg:pr-32 order-2 md:order-none pb-12 md:pb-0">
            <div className="text-left relative">
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-4 drop-shadow-lg leading-tight">
                <span className="text-white">Welcome to</span><br />
                <span className="text-accent-lime">ZenMap</span>
              </h1>
              <p className="text-white/60 text-xl md:text-2xl font-light">Your world, live and connected.</p>
              <span className="material-symbols-outlined absolute -top-8 -left-8 md:-top-6 md:-left-10 text-accent-lime text-4xl md:text-5xl animate-bounce">
                auto_awesome
              </span>
            </div>

            <div className="flex flex-col gap-5 w-full">
              <button
                onClick={() => setCurrentView('phone')}
                className="w-full h-16 rounded-full bg-primary hover:bg-primary-hover text-white font-bold text-xl shadow-glow transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-4 relative overflow-hidden group"
              >
                <span className="material-symbols-outlined text-3xl">call</span>
                Continue with Phone Number
                <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 rounded-full"></div>
              </button>

              <button className="w-full h-16 rounded-full bg-white hover:bg-gray-100 text-map-dark font-bold text-xl shadow-glow-white transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-4">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path d="M23.766 12.2764C23.766 11.4607 23.6999 10.6406 23.5588 9.83807H12.24V14.4591H18.7217C18.4528 15.9494 17.5885 17.2678 16.323 18.1056V21.1039H20.19C22.4608 19.0139 23.766 15.9274 23.766 12.2764Z" fill="#4285F4"></path>
                  <path d="M12.2401 24.0008C15.4766 24.0008 18.2059 22.9382 20.1945 21.1039L16.3275 18.1055C15.2517 18.8375 13.8627 19.252 12.2445 19.252C9.11388 19.252 6.45946 17.1399 5.50705 14.3003H1.5166V17.3912C3.55371 21.4434 7.7029 24.0008 12.2401 24.0008Z" fill="#34A853"></path>
                  <path d="M5.50253 14.3003C5.00236 12.8099 5.00236 11.1961 5.50253 9.70575V6.61481H1.51649C-0.18551 10.0056 -0.18551 14.0004 1.51649 17.3912L5.50253 14.3003Z" fill="#FBBC05"></path>
                  <path d="M12.2401 4.74966C13.9509 4.7232 15.6044 5.36697 16.8439 6.54867L20.2695 3.12262C18.1001 1.0855 15.2208 -0.0344664 12.2401 0.000808666C7.7029 0.000808666 3.55371 2.55822 1.5166 6.61481L5.50264 9.70575C6.45064 6.86173 9.10947 4.74966 12.2401 4.74966Z" fill="#EA4335"></path>
                </svg>
                Continue with Google
              </button>
            </div>

            <div className="mt-2 space-y-4">
              <p className="text-sm text-white/40">
                By continuing, you agree to our <a className="underline hover:text-white/60 transition-colors" href="#">Terms of Service</a> and <a className="underline hover:text-white/60 transition-colors" href="#">Privacy Policy</a>.
              </p>
              <div className="pt-4 border-t border-white/10 w-full">
                <p className="text-base font-medium text-white/60">
                  Already have an account?
                  <button className="text-accent-cyan hover:text-white font-bold ml-2 transition-colors hover:underline decoration-2 underline-offset-4">Log in</button>
                </p>
              </div>
            </div>

          </div>
        </main>
      )}

      {currentView === 'phone' && (
        <div className="w-full h-full flex items-center justify-center">
          <div className="hidden lg:flex flex-1 relative h-full bg-map-dark overflow-hidden items-center justify-center">
            {/* ... Only change is needed if you want QR in Login too, but sidebar is better */}
            <div className="relative z-10 w-[500px] h-[500px] flex items-center justify-center">
              <div className="relative w-64 h-[500px] bg-gradient-to-br from-gray-800 to-black rounded-[3rem] border-8 border-gray-700 shadow-float animate-float-slow z-20 flex flex-col overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-primary/10 to-transparent"></div>
                <div className="mt-12 mx-4 h-32 bg-white/5 rounded-2xl mb-4 flex items-center justify-center">
                  <span className="text-6xl filter drop-shadow-lg">🗺️</span>
                </div>
                {/* ... rest of phone view ... */}
                <div className="mx-4 h-12 bg-white/5 rounded-xl w-3/4 mb-2"></div>
                <div className="mx-4 h-12 bg-white/5 rounded-xl w-1/2"></div>

                <div className="absolute -right-12 top-24 bg-accent-pink p-3 rounded-2xl shadow-glow animate-float-delayed z-30">
                  <span className="material-symbols-outlined text-white text-3xl">favorite</span>
                </div>
                <div className="absolute -left-8 bottom-32 bg-accent-lime p-3 rounded-2xl shadow-glow animate-float-delayed z-30" style={{ animationDelay: '1s' }}>
                  <span className="material-symbols-outlined text-black text-3xl">location_on</span>
                </div>
                <div className="absolute -right-4 bottom-12 bg-accent-cyan p-3 rounded-2xl shadow-glow animate-float-delayed z-30" style={{ animationDelay: '3s' }}>
                  <span className="material-symbols-outlined text-black text-3xl">sms</span>
                </div>
              </div>
              {/* Background Circles behind phone */}
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] border border-white/5 rounded-full z-0"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] border border-white/10 rounded-full z-0"></div>
            </div>
          </div>

          <div className="flex-1 flex flex-col relative z-20 bg-card-dark lg:max-w-xl w-full h-full shadow-2xl lg:border-l lg:border-white/5 overflow-y-auto hide-scrollbar">
            <div className="absolute inset-0 w-full h-full map-bg z-0 pointer-events-none lg:hidden">
              <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[100px]"></div>
              <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-accent-cyan/5 rounded-full blur-[100px]"></div>
            </div>

            <div className="relative z-20 w-full px-8 pt-12 pb-4 flex items-center">
              <button
                onClick={() => setCurrentView('landing')}
                className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md flex items-center justify-center transition-colors group"
              >
                <span className="material-symbols-outlined text-white group-hover:-translate-x-1 transition-transform">arrow_back</span>
              </button>
            </div>

            <div className="relative z-10 flex-1 flex flex-col justify-center px-12 lg:px-20 max-w-lg mx-auto w-full">
              <div className="mb-10">
                <h1 className="text-4xl lg:text-5xl font-bold tracking-tight mb-4 text-white">Let's get started</h1>
                <p className="text-white/60 text-lg font-medium leading-relaxed">Enter your details to join the map.</p>
              </div>

              <div className="mb-6">
                <label className="text-white/60 text-sm font-semibold mb-2 block ml-1">Your Name</label>
                <div className="h-16 flex-1 bg-white/5 rounded-2xl border border-white/10 flex items-center px-6 focus-within:bg-white/10 focus-within:border-primary focus-within:shadow-glow transition-all">
                  <span className="material-symbols-outlined text-white/40 mr-3">person</span>
                  <input
                    autoFocus
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full bg-transparent border-none text-xl font-bold text-white placeholder-white/20 focus:ring-0 p-0 tracking-wide outline-none h-full"
                    placeholder="Enter your display name"
                    type="text"
                  />
                </div>
              </div>

              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <label className="text-white/60 text-sm font-semibold mb-2 block ml-1">Phone Number (Optional)</label>
                  <div className="flex items-center gap-2 w-full">
                    <div className="h-14 px-3 bg-white/5 rounded-xl border border-white/10 flex items-center justify-center shrink-0">
                      <span className="text-lg font-bold text-white">+62</span>
                    </div>
                    <div className="h-14 flex-1 bg-white/5 rounded-xl border border-white/10 flex items-center px-4 focus-within:bg-white/10 focus-within:border-primary focus-within:shadow-glow transition-all">
                      <input
                        value={phoneNumber}
                        onChange={handlePhoneChange}
                        className="w-full bg-transparent border-none text-xl font-bold text-white placeholder-white/20 focus:ring-0 p-0 tracking-wide outline-none h-full"
                        placeholder="812 3456 7890"
                        type="tel"
                      />
                    </div>
                  </div>
                </div>
              </div>



              <div className="hidden lg:block p-4 rounded-xl bg-blue-900/20 border border-blue-500/20 mb-8">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-xl mt-0.5">info</span>
                  <p className="text-sm text-blue-100/70">Ensure both devices are in the same Room ID.</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  try {
                    if (!isFormValid) {
                      showToast("Please enter your name", "error");
                      return;
                    }
                    handleNext();
                  } catch (e) {
                    console.error(e);
                    showToast("Error: " + e.message, "error");
                  }
                }}
                className={`w-full h-16 rounded-2xl bg-primary text-white font-bold text-xl shadow-glow transition-all hover:bg-primary-hover active:scale-[0.98] flex items-center justify-center gap-3 group mt-4 lg:mt-0 ${!isFormValid ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={isTracking}
              >
                {isTracking ? (
                  <>
                    <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full mr-2"></span>
                    Locating...
                  </>
                ) : (
                  <>
                    Next
                    <span className="material-symbols-outlined text-2xl group-disabled:hidden">arrow_forward</span>
                  </>
                )}
              </button>

              {/* Tracking Overlay */}
              {isTracking && (
                <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center text-white rounded-l-[3rem]">
                  <div className="relative">
                    <div className="w-32 h-32 rounded-full border-4 border-primary/30 animate-spin" style={{ animationDuration: '3s' }}></div>
                    <div className="absolute inset-0 w-32 h-32 rounded-full border-4 border-t-primary animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="material-symbols-outlined text-4xl text-primary animate-pulse">radar</span>
                    </div>
                  </div>
                  <h2 className="mt-8 text-2xl font-bold tracking-widest animate-pulse text-primary">TRIANGULATING SIGNAL</h2>
                  <p className="mt-2 text-white/50 font-mono text-sm">Target: +62 {phoneNumber}</p>
                  <div className="mt-6 flex flex-col items-center gap-1">
                    <span className="text-xs text-accent-cyan animate-bounce">Acquiring GPS Lock...</span>
                    <span className="text-xs text-accent-lime animate-bounce" style={{ animationDelay: '0.5s' }}>Connecting to Satellite...</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-white/30 text-center mt-6 lg:hidden">
                Carrier rates may apply.
              </p>
            </div>

            <div className="relative z-20 p-8 w-full mt-auto hidden lg:block text-center">
              <p className="text-sm text-white/30">
                By continuing, you agree to our Terms of Service and Privacy Policy.
              </p>
            </div>
          </div>
        </div>
      )}

      {currentView === 'map' && (
        <div className="absolute inset-0 w-full h-full bg-black z-0 overflow-hidden">
          {/* Real Google Maps Embed (Satellite/Hybrid View) */}
          {/* React Leaflet Map */}
          <MapContainer
            center={[userLocation.lat, userLocation.lng]}
            zoom={zoom}
            zoomControl={false}
            className="absolute inset-0 w-full h-full z-0"
            style={{ height: "100%", width: "100%" }}
          >
            <MapUpdater center={[userLocation.lat, userLocation.lng]} zoom={zoom} />

            {/* Esri World Imagery (Satellite) */}
            <TileLayer
              attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              maxZoom={19}
            />

            {/* Hybrid Labels - CartoDB Dark Labels */}
            <TileLayer
              url="https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_only_labels/{z}/{x}/{y}.png"
              opacity={1}
            />

            {/* Other Live Users (from MQTT) */}
            {Object.entries(otherUsers).map(([id, user]) => (
              <Marker
                key={id}
                position={[user.lat, user.lng]}
                icon={L.divIcon({
                  className: 'custom-peer-icon',
                  html: `<div class="relative w-full h-full flex items-center justify-center">
                          <div class="absolute inset-0 bg-orange-500/30 rounded-full animate-ping"></div>
                          <div class="absolute inset-0 bg-orange-500/20 rounded-full animate-pulse"></div>
                          <div class="relative w-12 h-12 rounded-full border-2 border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.6)] overflow-hidden bg-black">
                            <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=${user.avatarSeed}&backgroundColor=ffdfbf" class="w-full h-full object-cover" />
                          </div>
                          <div class="absolute -bottom-2 bg-black/80 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-orange-500/50 shadow-sm whitespace-nowrap">
                            ${user.name}
                          </div>
                        </div>`,
                  iconSize: [60, 60],
                  iconAnchor: [30, 30]
                })}
              >
                <Popup>
                  <div className="text-black font-sans min-w-[150px]">
                    <div class="flex items-center gap-2 mb-2">
                      <img src="https://api.dicebear.com/9.x/avataaars/svg?seed=${user.avatarSeed}&backgroundColor=ffdfbf" class="w-8 h-8 rounded-full bg-gray-100" />
                      <div>
                        <strong class="block text-sm leading-tight">${user.name}</strong>
                        <span className="text-orange-500 font-bold text-[10px] uppercase tracking-wider">Live Tracking</span>
                      </div>
                    </div>
                    <div class="text-xs text-gray-500">
                      Updated: just now
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}



            {/* User Location */}
            <Marker position={[userLocation.lat, userLocation.lng]} icon={L.divIcon({
              className: 'custom-user-icon',
              html: `<div class="relative flex items-center justify-center w-full h-full">
                    ${isSharing ? '<div class="size-64 rounded-full bg-accent-lime/10 animate-ping absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 duration-[2s]"></div>' : ''}
                    <div class="size-32 rounded-full animate-ping absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${isSharing ? 'bg-accent-lime/20' : 'bg-primary/10'}"></div>
                    <div class="size-32 rounded-full animate-pulse absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${isSharing ? 'bg-accent-lime/10' : 'bg-primary/5'}"></div>
                    <div class="size-6 border-[3px] border-white rounded-full relative z-10 transition-colors ${isSharing ? 'bg-accent-lime shadow-[0_0_30px_rgba(204,255,0,0.8)]' : 'bg-primary shadow-[0_0_30px_rgba(43,140,238,0.8)]'}"></div>
                  </div>`,
              iconSize: [128, 128],
              iconAnchor: [64, 64]
            })} />

          </MapContainer>

          {/* Mobile Toggle Button */}
          <div className="absolute top-4 left-4 z-50 lg:hidden pointer-events-auto">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="size-12 rounded-full bg-glass-medium backdrop-blur-xl text-white flex items-center justify-center shadow-float border border-white/10 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined">{isSidebarOpen ? 'close' : 'menu'}</span>
            </button>
          </div>

          <div className={`absolute lg:relative inset-0 z-40 h-full flex pointer-events-none ${isSidebarOpen ? 'pointer-events-auto' : ''}`}>

            {/* Mobile Backdrop */}
            <div
              className={`absolute inset-0 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
              onClick={() => setIsSidebarOpen(false)}
            />

            {/* Sidebar */}
            <div className={`w-80 h-full bg-glass-medium backdrop-blur-xl border-r border-white/5 flex flex-col pointer-events-auto shadow-2xl z-50 transition-transform duration-300 ease-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
              <div className="p-6 border-b border-white/5 flex items-center gap-3">
                <ZenMapLogo className="w-10 h-10 shadow-glow" />

                <h1 className="text-xl font-bold tracking-wide">ZenMap</h1>
                <div
                  className="ml-auto flex items-center gap-2 bg-white/5 hover:bg-white/10 rounded-full px-3 py-1.5 cursor-pointer transition-colors border border-dashed border-white/20 hover:border-accent-cyan/50 group"
                  title="Click to change Room ID"
                  onClick={() => {
                    const newRoom = prompt("Enter new Room ID:", roomId);
                    if (newRoom) {
                      const cleanRoom = newRoom.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').substr(0, 6);
                      if (cleanRoom) {
                        setRoomId(cleanRoom);
                        window.location.hash = cleanRoom;
                        // Reload to reset connection
                        setTimeout(() => window.location.reload(), 500);
                      }
                    }
                  }}
                >
                  <span className="material-symbols-outlined text-green-400 text-xs group-hover:text-accent-cyan transition-colors">vpn_key</span>
                  <div className="flex flex-col items-start leading-none">
                    <span className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Room ID</span>
                    <span className="text-xs text-white font-mono tracking-wider font-bold">{roomId}</span>
                  </div>
                  <span className="material-symbols-outlined text-white/20 text-xs ml-1 group-hover:text-white/60">edit</span>
                </div>

                {/* Mobile Close Button */}
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="lg:hidden ml-2 size-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white active:scale-90"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              <div className="p-4 flex items-center gap-3 hover:bg-white/5 transition-colors cursor-pointer mx-2 mt-2 rounded-xl border border-white/5 bg-white/5 group/card">
                <div className={`relative size-12 rounded-full p-0.5 bg-gradient-to-tr ${isSharing ? 'from-accent-lime to-green-600 animate-pulse-slow' : 'from-gray-600 to-gray-800'}`}>
                  <img
                    alt="My Avatar"
                    className="w-full h-full rounded-full object-cover border-2 border-[#111a22]"
                    src={profileImage || `https://api.dicebear.com/9.x/avataaars/svg?seed=${myId}&backgroundColor=b6e3f4`}
                  />
                  {isSharing && (
                    <div className="absolute -bottom-1 -right-1 bg-[#111a22] rounded-full p-1 border border-white/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-[10px] text-accent-lime animate-pulse">wifi_tethering</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold flex items-center gap-2 text-white truncate">
                    {userName || 'Me'}
                    <span className="text-[10px] bg-white/10 text-white/60 px-1.5 rounded uppercase tracking-wider border border-white/5 shrink-0">YOU</span>
                  </div>
                  <div className={`text-xs mt-0.5 flex items-center gap-1 ${isSharing ? 'text-accent-lime' : 'text-white/40'}`}>
                    <span className={`size-1.5 rounded-full ${isSharing ? 'bg-accent-lime animate-ping' : 'bg-white/20'}`}></span>
                    {isSharing ? 'Broadcasting Location' : 'Location Hidden'}
                  </div>
                </div>

                <button
                  className="p-2 rounded-full bg-white/5 hover:bg-white/20 text-white/60 hover:text-white transition-all flex items-center justify-center hover:rotate-90 duration-500 shadow-sm border border-white/5"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentView('settings');
                  }}
                  title="Settings"
                >
                  <span className="material-symbols-outlined text-[20px]">settings</span>
                </button>
              </div>

              {/* Connection Status Bar */}
              <div className="px-6 py-2 bg-black/20 border-y border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`size-2 rounded-full ${client ? 'bg-green-500 shadow-glow-sm' : 'bg-red-500 animate-pulse'}`}></div>
                  <span className="text-[10px] text-white/50 font-mono uppercase tracking-wider">
                    {client ? 'Connected' : 'Connecting...'}
                  </span>
                </div>
                <div className="text-[10px] text-white/40 font-mono">
                  {Object.keys(otherUsers).length} ONLINE
                </div>
              </div>

              {/* Tab Switcher */}
              <div className="flex border-b border-white/5">
                <button
                  onClick={() => setActiveTab('users')}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'users' ? 'text-primary bg-primary/10 border-b-2 border-primary' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                >
                  Map Users
                </button>
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${activeTab === 'chat' ? 'text-primary bg-primary/10 border-b-2 border-primary' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                >
                  Live Chat
                </button>
              </div>

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto hide-scrollbar p-0 relative">

                {activeTab === 'users' && (
                  <div className="p-4 space-y-2">
                    <div className="text-xs font-bold text-white/40 uppercase tracking-wider mb-3 px-2">Online Friends</div>

                    {/* Other Live Users List (from MQTT) */}
                    {Object.entries(otherUsers).length === 0 ? (
                      <div className="text-center py-8 text-white/20 italic text-sm border border-dashed border-white/10 rounded-xl">
                        Waiting for friends...
                      </div>
                    ) : (
                      Object.entries(otherUsers).map(([id, user]) => (
                        <div key={id} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors group text-left border border-white/5 bg-white/5 mb-2 relative">
                          <div className="relative">
                            <div className="size-10 rounded-full p-0.5 bg-gradient-to-tr from-orange-400 to-red-500">
                              <img alt={user.name} className="w-full h-full rounded-full object-cover border border-[#111a22]" src={`https://api.dicebear.com/9.x/avataaars/svg?seed=${user.avatarSeed}&backgroundColor=ffdfbf`} />
                            </div >
                            <div className="absolute -bottom-1 -right-1 bg-[#111a22] rounded-full p-0.5 border border-white/10 flex items-center justify-center">
                              <span className="material-symbols-outlined text-[10px] text-green-400 animate-pulse">circle</span>
                            </div>
                          </div >
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white flex items-center gap-2 truncate">
                              {user.name || 'Unknown User'}
                              <span className="bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold animate-pulse shadow-glow-sm">LIVE</span>
                            </div>
                            <div className="text-xs text-white/50 group-hover:text-white/70 mt-0.5 truncate">Tracking Active</div>
                          </div>

                          {/* Kick Button */}
                          <button
                            className="size-8 rounded-full bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white flex items-center justify-center border border-red-500/20 transition-all active:scale-95 opacity-0 group-hover:opacity-100"
                            title="Kick User"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(`Kick ${user.name}? This will remove them from the room.`)) {
                                const kickPayload = JSON.stringify({ type: 'kick', targetId: id });
                                client.publish(`zenmap/${roomId}/${myId}`, kickPayload, { qos: 1 });
                                client.publish(`zenmap/${roomId}/${id}`, "", { retain: true, qos: 1 });
                                setOtherUsers(prev => {
                                  const next = { ...prev };
                                  delete next[id];
                                  return next;
                                });
                                showToast(`Kicked ${user.name}`, "info");
                              }
                            }}
                          >
                            <span className="material-symbols-outlined text-sm">block</span>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {activeTab === 'chat' && (
                  <div className="flex flex-col min-h-full justify-end p-4 gap-3">
                    {chatMessages.length === 0 && (
                      <div className="flex-1 flex flex-col items-center justify-center text-white/20 h-full min-h-[200px]">
                        <span className="material-symbols-outlined text-4xl mb-2">forum</span>
                        <p className="text-sm">No messages yet.</p>
                      </div>
                    )}
                    {chatMessages.map((msg, idx) => (
                      <div key={idx} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'} animate-in slide-in-from-bottom-2 fade-in duration-300`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${msg.isMe ? 'bg-primary text-white rounded-br-none shadow-glow-primary' : 'bg-white/10 text-white rounded-bl-none border border-white/5'}`}>
                          {!msg.isMe && <div className="text-[10px] text-accent-lime font-bold mb-1 opacity-80">{msg.name}</div>}
                          {msg.text}
                        </div>
                        <span className="text-[10px] text-white/20 mt-1 px-1">{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}

              </div>

              {/* Footer Area */}
              <div className="p-4 border-t border-white/5 bg-black/20 shrink-0">
                {activeTab === 'users' ? (
                  <button
                    onClick={() => setIsSharing(!isSharing)}
                    className={`w-full py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${isSharing ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/20' : 'bg-white/5 hover:bg-white/10 text-white/80 border border-white/5'}`}
                  >
                    <span className="material-symbols-outlined text-lg animate-pulse">{isSharing ? 'stop_circle' : 'share_location'}</span>
                    {isSharing ? 'Stop Broadcasting' : 'Share Live Location'}
                  </button>
                ) : (
                  <form onSubmit={sendMessage} className="flex gap-2 relative">
                    <input
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:bg-white/10 focus:border-primary focus:outline-none placeholder-white/20 transition-all font-medium"
                    />
                    <button
                      type="submit"
                      disabled={!messageInput.trim()}
                      className="size-11 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary-hover active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-glow-primary"
                    >
                      <span className="material-symbols-outlined text-xl">send</span>
                    </button>
                  </form>
                )}
              </div>
            </div >

            {/* Main Map Area */}
            < div className="flex-1 relative h-full" >
              <div className="absolute inset-0 pointer-events-none">
                {/* Markers are now rendered inside the Leaflet MapContainer */}
              </div>

              {/* Map Controls */}
              {/* Map Controls */}
              <div className="absolute right-4 lg:right-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 lg:gap-4 pointer-events-auto z-30">
                <button onClick={handleZoomIn} className="size-10 lg:size-12 rounded-full bg-glass-medium backdrop-blur-xl text-white flex items-center justify-center shadow-float border border-white/10 hover:bg-glass-dark active:scale-95 transition-all group" title="Zoom In">
                  <span className="material-symbols-outlined text-[20px] lg:text-[24px] group-hover:text-primary transition-colors">add</span>
                </button>
                <button onClick={handleZoomOut} className="size-10 lg:size-12 rounded-full bg-glass-medium backdrop-blur-xl text-white flex items-center justify-center shadow-float border border-white/10 hover:bg-glass-dark active:scale-95 transition-all group" title="Zoom Out">
                  <span className="material-symbols-outlined text-[20px] lg:text-[24px] group-hover:text-primary transition-colors">remove</span>
                </button>
                <div className="h-px w-6 lg:w-8 bg-white/10 mx-auto my-1"></div>
                <button onClick={handleRecenter} className="size-10 lg:size-12 rounded-full bg-glass-medium backdrop-blur-xl text-white flex items-center justify-center shadow-float border border-white/10 hover:bg-glass-dark active:scale-95 transition-all group" title="Recenter">
                  <span className="material-symbols-outlined text-[20px] lg:text-[24px] group-hover:text-primary transition-colors">near_me</span>
                </button>
                <button onClick={() => setZoom(prev => prev)} className="size-10 lg:size-12 rounded-full bg-glass-medium backdrop-blur-xl text-white flex items-center justify-center shadow-float border border-white/10 hover:bg-glass-dark active:scale-95 transition-all group" title="Compass">
                  <span className="material-symbols-outlined text-[20px] lg:text-[24px] group-hover:text-primary transition-colors transform -rotate-45">explore</span>
                </button>

                <div className="h-px w-6 lg:w-8 bg-white/10 mx-auto my-1"></div>
                <button
                  onClick={() => setIsQRVisible(!isQRVisible)}
                  className={`size-10 lg:size-12 rounded-full bg-glass-medium backdrop-blur-xl flex items-center justify-center shadow-float border border-white/10 hover:bg-glass-dark active:scale-95 transition-all group ${isQRVisible ? 'bg-white text-black' : 'text-white'}`}
                  title="Connect Mobile"
                >
                  <span className="material-symbols-outlined text-[20px] lg:text-[24px] group-hover:text-primary transition-colors">qr_code_2</span>
                </button>
              </div>

              {/* Mobile FAB: Share Location (Visible only on mobile when not sharing) */}
              {!isSharing && (
                <div className="absolute bottom-24 right-4 z-30 lg:hidden pointer-events-auto">
                  <button
                    onClick={() => setIsSharing(true)}
                    className="h-12 px-5 rounded-full bg-primary text-white shadow-glow-primary flex items-center gap-2 font-bold hover:scale-105 active:scale-95 transition-all border border-white/20"
                  >
                    <span className="material-symbols-outlined text-[20px]">share_location</span>
                    <span className="text-sm">Go Live</span>
                  </button>
                </div>
              )}

              {/* QR Code Modal Overlay */}
              {
                isQRVisible && (
                  <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={() => setIsQRVisible(false)}>
                    <div className="bg-glass-medium border border-white/10 p-8 rounded-3xl max-w-sm w-full text-center relative shadow-2xl" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => setIsQRVisible(false)}
                        className="absolute top-4 right-4 text-white/50 hover:text-white transition-colors"
                      >
                        <span className="material-symbols-outlined">close</span>
                      </button>

                      <div className="mb-6">
                        <div className="size-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-primary/30">
                          <span className="material-symbols-outlined text-3xl text-primary">devices</span>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Connect Mobile</h3>
                        <p className="text-white/60 text-sm mb-4">Scan this QR code with your phone to open the map.</p>
                      </div>

                      <div className="bg-white p-4 rounded-xl mx-auto inline-block shadow-glow-white mb-6">
                        <QRCode
                          value={window.location.href}
                          size={200}
                          style={{ height: "auto", maxWidth: "100%", width: "100%" }}
                          viewBox={`0 0 256 256`}
                        />
                      </div>

                      <div className="bg-white/5 rounded-lg p-3 text-xs text-white/40 border border-white/5 break-all font-mono">
                        {window.location.href}
                      </div>
                    </div>
                  </div>
                )
              }

              {/* Bottom Bar: Search & Add Friend */}
              <div className="absolute bottom-8 left-0 right-0 flex justify-center items-end pointer-events-none px-8">
                <div className="pointer-events-auto flex items-center bg-glass-medium backdrop-blur-xl rounded-full px-2 py-2 shadow-float border border-white/10 w-full max-w-2xl mx-auto h-16 group focus-within:ring-2 focus-within:ring-primary/50 transition-all">
                  <div className="pl-4 pr-3">
                    <span className="material-symbols-outlined text-white/40 text-[24px]">search</span>
                  </div>
                  <input className="bg-transparent border-none text-white placeholder-white/40 w-full focus:ring-0 text-lg font-medium h-full" placeholder="Search friends, places, or coordinates..." type="text" />
                  <button className="bg-[#233648] hover:bg-primary/20 rounded-full size-10 flex items-center justify-center text-white/60 hover:text-white transition-colors mr-1">
                    <span className="material-symbols-outlined text-[20px]">mic</span>
                  </button>
                </div>

              </div>
            </div >
          </div >
        </div >
      )}
      {currentView === 'settings' && (
        <div className="relative w-full h-full bg-background-dark overflow-hidden flex shadow-2xl border border-white/5 font-display text-slate-100">
          {/* Background Effects */}
          <div className="absolute inset-0 map-grid-bg pointer-events-none opacity-40"></div>
          <div className="absolute -top-40 -left-40 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px]"></div>
          <div className="absolute bottom-0 right-0 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[150px]"></div>

          {/* Sidebar (Desktop) */}
          {/* Sidebar (Desktop Only) */}
          <aside className="hidden lg:flex relative z-20 w-80 border-r border-glass-border glass-effect flex-col">
            <div className="p-10">
              <div className="flex items-center gap-3 mb-12">
                <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center neon-shadow">
                  <span className="material-symbols-outlined text-white">explore</span>
                </div>
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-primary bg-clip-text text-transparent">PEJUMISMAPS</span>
              </div>
              <nav className="space-y-4">
                <button
                  onClick={() => setCurrentView('map')}
                  className="w-full flex items-center gap-4 px-6 py-4 mb-8 text-slate-300 hover:text-white hover:bg-white/5 border border-glass-border rounded-xl transition-all group"
                >
                  <span className="material-symbols-outlined transition-transform group-hover:-translate-x-1">arrow_back</span>
                  <span className="font-bold tracking-wide uppercase text-sm">Back to Map</span>
                </button>
                <div className="h-px bg-glass-border mb-6"></div>
                <button className="w-full sidebar-link-active flex items-center gap-4 px-6 py-4 rounded-r-xl transition-all text-left">
                  <span className="material-symbols-outlined">person</span>
                  <span className="font-medium">Account</span>
                </button>
              </nav>
            </div>
            <div className="mt-auto p-10">
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to logout?')) {
                    localStorage.removeItem('zenmap_username');
                    window.location.reload();
                  }
                }}
                className="flex items-center gap-4 px-6 py-4 text-slate-500 hover:text-red-400 transition-all"
              >
                <span className="material-symbols-outlined">logout</span>
                <span className="font-medium">Logout</span>
              </button>
            </div>
          </aside>

          {/* Main Content */}
          <main className="relative z-10 flex-1 overflow-y-auto bg-transparent flex flex-col hide-scrollbar">
            {/* Mobile Navigation Header */}
            <div className="lg:hidden flex items-center justify-between px-6 py-6 border-b border-glass-border bg-glass-dark backdrop-blur-md sticky top-0 z-30">
              <button
                onClick={() => setCurrentView('map')}
                className="size-10 flex items-center justify-center rounded-full bg-white/5 text-white active:scale-95"
              >
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <span className="font-bold text-lg">My Profile</span>
              <button
                onClick={() => {
                  if (confirm('Are you sure you want to logout?')) {
                    localStorage.removeItem('zenmap_username');
                    window.location.reload();
                  }
                }}
                className="size-10 flex items-center justify-center rounded-full bg-red-500/10 text-red-400 active:scale-95"
              >
                <span className="material-symbols-outlined">logout</span>
              </button>
            </div>

            <header className="hidden lg:flex items-center justify-between px-16 py-10">
              <div>
                <h2 className="text-3xl font-bold text-white mb-2">Profile Settings</h2>
                <p className="text-slate-400">Manage your public identity and map preferences</p>
              </div>
              <div className="flex items-center gap-4">

                <div className="w-12 h-12 rounded-full border border-glass-border flex items-center justify-center glass-effect cursor-pointer hover:bg-white/5 transition-all">
                  <span className="material-symbols-outlined text-white">dark_mode</span>
                </div>
              </div>
            </header>

            <div className="px-6 py-6 lg:px-16 lg:pb-16">
              <div className="max-w-4xl mx-auto flex flex-col lg:flex-row gap-8 lg:gap-16 items-start">
                {/* Profile Card */}
                <div className="flex flex-col items-center flex-shrink-0 w-full lg:w-auto">
                  <div className="relative group">
                    <div className="w-32 h-32 lg:w-48 lg:h-48 rounded-full border-4 border-primary/20 p-2 flex items-center justify-center overflow-hidden glass-dark">
                      <div className="w-full h-full rounded-full bg-cover bg-center" style={{ backgroundImage: `url('${profileImage || `https://api.dicebear.com/9.x/avataaars/svg?seed=${myId}&backgroundColor=b6e3f4`}')` }}></div>
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute bottom-1 right-1 lg:bottom-2 lg:right-2 w-10 h-10 lg:w-12 lg:h-12 bg-primary text-white rounded-full flex items-center justify-center border-4 border-background-dark neon-shadow hover:scale-110 hover:bg-blue-400 transition-all"
                    >
                      <span className="material-symbols-outlined text-lg lg:text-2xl">photo_camera</span>
                    </button>
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                  </div>
                  <div className="mt-4 lg:mt-6 text-center">
                    <h3 className="font-bold text-white text-lg">{userName || 'Anonymous'}</h3>
                    <p className="text-primary text-sm font-semibold tracking-wider uppercase mt-1">Digital Explorer</p>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="flex-1 w-full space-y-8">
                  <div className="grid grid-cols-1 gap-8">
                    <div className="flex flex-col gap-3">
                      <label className="px-2 text-sm font-medium text-slate-300">Display Name</label>
                      <div className="relative flex items-center">
                        <div className="absolute left-5 text-primary">
                          <span className="material-symbols-outlined">person</span>
                        </div>
                        <input
                          className="w-full bg-glass border border-glass-border rounded-2xl py-5 pl-14 pr-6 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none glass-effect transition-all placeholder:text-slate-500"
                          placeholder="Enter your display name"
                          type="text"
                          value={userName}
                          onChange={(e) => setUserName(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-3">
                      <label className="px-2 text-sm font-medium text-slate-300">Bio</label>
                      <div className="relative flex flex-col">
                        <div className="absolute left-5 top-5 text-primary">
                          <span className="material-symbols-outlined">description</span>
                        </div>
                        <textarea
                          className="w-full bg-glass border border-glass-border rounded-2xl py-5 pl-14 pr-6 text-white focus:ring-2 focus:ring-primary/50 focus:border-primary outline-none glass-effect transition-all placeholder:text-slate-500 min-h-[160px] resize-none"
                          placeholder="Share your story..."
                          defaultValue="Digital nomad and urban explorer. Mapping the hidden gems of Northern Europe. #explorer #pejumis"
                        ></textarea>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-glass border border-glass-border rounded-2xl glass-effect gap-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                          <span className="material-symbols-outlined text-primary">visibility</span>
                        </div>
                        <div>
                          <p className="text-base font-semibold text-white">Public Profile</p>
                          <p className="text-sm text-slate-400">Allow others to see your maps and pins</p>
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input defaultChecked className="sr-only peer" type="checkbox" />
                        <div className="w-14 h-7 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:start-[4px] after:bg-white after:rounded-full after:h-5 after:w-6 after:transition-all peer-checked:bg-primary"></div>
                      </label>
                    </div>

                    <div className="flex justify-end pt-4 pb-20 lg:pb-0">
                      <button
                        onClick={() => showToast("Profile changes saved!", "info")}
                        className="w-full lg:w-auto px-10 py-4 lg:py-5 bg-primary text-white font-bold rounded-2xl neon-shadow hover:bg-blue-400 active:scale-95 transition-all flex items-center justify-center gap-3 sticky bottom-6 z-40 lg:relative lg:bottom-auto lg:z-auto shadow-xl lg:shadow-none"
                      >
                        <span className="material-symbols-outlined">save</span>
                        Save Changes
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute bottom-16 right-16 opacity-[0.03] rotate-12 pointer-events-none select-none">
              <span className="material-symbols-outlined text-[300px] text-primary">map</span>
            </div>
          </main>
        </div>
      )}

      {/* Toast Notification Overlay */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-full shadow-2xl backdrop-blur-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 ${toast.type === 'error' ? 'bg-red-500/90 text-white' : 'bg-white/90 text-black'}`}>
          <span className="material-symbols-outlined text-xl">{toast.type === 'error' ? 'error' : 'info'}</span>
          <span className="font-medium">{toast.msg}</span>
        </div>
      )}
    </div>
  )
}

export default App
