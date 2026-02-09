/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                "primary": "#2b8cee",
                "primary-hover": "#1a75d1",
                "accent-pink": "#ff00d4",
                "accent-lime": "#ccff00",
                "accent-cyan": "#00ffff",
                "map-dark": "#111a22",
                "glass-dark": "rgba(17, 26, 34, 0.65)",
                "glass-light": "rgba(255, 255, 255, 0.85)",
            },
            fontFamily: {
                "display": ["Spline Sans", "sans-serif"]
            },
            borderRadius: { "DEFAULT": "1rem", "lg": "2rem", "xl": "3rem", "full": "9999px" },
            boxShadow: {
                "glow": "0 0 20px rgba(43, 140, 238, 0.6)",
                "glow-white": "0 0 20px rgba(255, 255, 255, 0.3)",
                "float": "0 10px 30px -5px rgba(0, 0, 0, 0.3)"
            }
        },
    },
    plugins: [],
}
