// Horizontal centre (%) of each tab in the floating bar. Measured on a 1080px-wide
// screen: Home 153-180, Shop 402-429, Cart 651-678, Account 900-927 (centres of
// the four equal slots), so it scales to any screen width.
var slots = { Home: 15, Shop: 39, Cart: 62, Account: 85 };
output.tabX = slots[TAB] || 50;
