/**
 * NSS TGPCOP — Central Cloudinary Assets Configuration
 * Location: /cloudinary-config.js
 * 
 * Instructions:
 * 1. Upload your real campus & NSS event photos to Cloudinary (or any secure CDN).
 * 2. Paste the URLs into the corresponding fields below.
 * 3. Save this file — the website will automatically display your real photos!
 * 
 * When a field is left empty ("" or []), the website displays a dignified,
 * clean text-only layout or an intentional "Photos coming soon" notice.
 * No broken image icons or fake placeholders will ever be shown.
 */
window.NSS_CLOUDINARY_CONFIG = {
  // Optional Cloudinary cloud name
  cloudName: "",

  // Leadership & Desk Portraits (Real president portrait configured)
  presidentPortrait: "assets/president.jpg",
  programOfficerPortrait: "",

  // Core NSS Domain Feature Images (Optional - clean domain cards used if empty)
  activityHealthCamp: "",
  activityEnvironment: "",
  activitySwachhata: "",
  activityRuralCamp: "",

  // Recent Event Images (Optional - clean editorial cards used if empty)
  eventHealthCamp: "",
  eventSwachhata: "",
  eventPlantation: "",
  eventPharmacyRally: "",

  // Media Gallery Photos (Paste array of Cloudinary image URLs when ready)
  // Example:
  // galleryPhotos: [
  //   "https://res.cloudinary.com/your-cloud/image/upload/v1/camp1.jpg",
  //   "https://res.cloudinary.com/your-cloud/image/upload/v1/camp2.jpg"
  // ]
  galleryPhotos: []
};
