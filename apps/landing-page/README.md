# Zap Pilot Landing Page

A modern, animated landing page for Zap Pilot - the DeFi intent-based execution engine. Built with Next.js, TypeScript, Tailwind CSS, and Framer Motion.

## 🚀 Features

- **Modern Design**: Beautiful dark theme with gradient animations
- **Real-time Data**: Live DeFi metrics from CoinGecko and DeFiLlama APIs
- **Smooth Animations**: Powered by Framer Motion for premium UX
- **Responsive**: Optimized for all device sizes
- **Performance**: Static site generation with Next.js
- **GitHub Pages Ready**: Automated deployment workflow

## 🛠️ Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **APIs**: CoinGecko, DeFiLlama
- **Deployment**: GitHub Pages

## 📦 Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd landing-page

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the site.

## 🔧 Development

### Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

### Project Structure

```
src/
├── app/
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── Navbar.tsx
│   ├── Hero.tsx
│   ├── Features.tsx
│   ├── UseCases.tsx
│   ├── HowItWorks.tsx
│   ├── CTA.tsx
│   └── Footer.tsx
└── lib/
    └── api.ts
```

## 🌐 Deployment to GitHub Pages

### Automatic Deployment

1. Push to `main` branch
2. GitHub Actions will automatically build and deploy
3. Site will be available at `https://your-username.github.io/landing-page/`

### Manual Deployment

```bash
# Build static files
npm run build

# Files will be generated in ./out directory
# Upload ./out contents to your hosting provider
```

### GitHub Pages Setup

1. Go to repository Settings → Pages
2. Set Source to "GitHub Actions"
3. The workflow will automatically deploy on push to main

## 📊 API Integration

The landing page fetches real-time DeFi data from:

- **CoinGecko API**: Bitcoin and Ethereum prices
- **DeFiLlama API**: Total Value Locked (TVL) data
- **Automatic fallbacks**: Graceful degradation if APIs are unavailable

### API Features

- 30-second caching to reduce API calls
- Automatic retries with fallback data
- Real-time price updates
- Error handling and recovery

## 🎨 Customization

### Colors

The design uses a purple-blue gradient theme. Update colors in:

- `tailwind.config.js` for global color scheme
- Component files for specific gradient combinations

### Content

Update content in the component files:

- `Hero.tsx` - Main headline and subtitle
- `Features.tsx` - Feature descriptions
- `UseCases.tsx` - Use case examples

### Animations

Framer Motion animations can be customized in each component:

- Adjust `duration`, `delay`, and `ease` properties
- Modify `variants` for different animation patterns
- Add new animations using `motion` components

## 📱 Mobile Optimization

- Responsive grid layouts
- Touch-friendly interactions
- Optimized animations for mobile devices
- Mobile-first design approach

## ⚡ Performance

- Static site generation for fast loading
- Optimized images and assets
- Minimal JavaScript bundle
- Efficient animation performance
- API caching and error handling

## 🔒 Security

- No server-side components for static hosting
- HTTPS-only external API calls
- No sensitive data in client-side code
- CSP-compatible inline styles

## 📄 License

This project is part of the Zap Pilot ecosystem. See the main repository for license information.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📞 Support

For questions or issues:

- Create an issue in the repository
- Join our Discord community
- Check the documentation

---

Built with ❤️ for the DeFi community
