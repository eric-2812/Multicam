// Old QR codes and desktop apps (0.11 and earlier) send phones to the site root with ?join=…;
// the app now lives under app/, so pass them straight through.
if (new URLSearchParams(location.search).has('join')) location.replace(`app/${location.search}${location.hash}`)
