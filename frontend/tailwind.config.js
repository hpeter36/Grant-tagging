/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Teal/green color scheme matching Lasso design
        border: "hsl(0 0% 90%)",
        input: "hsl(0 0% 90%)",
        ring: "hsl(173 80% 40%)", // Teal ring
        background: "hsl(0 0% 100%)",
        foreground: "hsl(0 0% 15%)",
        primary: {
          DEFAULT: "hsl(173 80% 40%)", // Dark teal/green for buttons
          foreground: "hsl(0 0% 100%)",
        },
        secondary: {
          DEFAULT: "hsl(173 30% 95%)", // Light teal background
          foreground: "hsl(173 80% 30%)",
        },
        destructive: {
          DEFAULT: "hsl(0 84.2% 60.2%)",
          foreground: "hsl(0 0% 100%)",
        },
        muted: {
          DEFAULT: "hsl(0 0% 96%)",
          foreground: "hsl(0 0% 45%)",
        },
        accent: {
          DEFAULT: "hsl(173 30% 95%)",
          foreground: "hsl(173 80% 30%)",
        },
        popover: {
          DEFAULT: "hsl(0 0% 100%)",
          foreground: "hsl(0 0% 15%)",
        },
        card: {
          DEFAULT: "hsl(0 0% 100%)",
          foreground: "hsl(0 0% 15%)",
        },
        // Custom teal shades
        teal: {
          50: "hsl(173 30% 98%)",
          100: "hsl(173 30% 95%)",
          200: "hsl(173 40% 85%)",
          300: "hsl(173 50% 70%)",
          400: "hsl(173 60% 55%)",
          500: "hsl(173 80% 40%)", // Main teal
          600: "hsl(173 80% 35%)",
          700: "hsl(173 80% 30%)", // Dark teal for headings
          800: "hsl(173 80% 25%)",
          900: "hsl(173 80% 20%)",
        },
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};


