/**
 * NSS TGPCOP — Central Cloudinary Assets Configuration
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

  // Leadership & Desk Portraits
  presidentPortrait: "",       // URL for President / Executive Desk photo
  programOfficerPortrait: "",  // URL for NSS Program Officer / Faculty Incharge photo

  // Core NSS Domain Feature Images (Optional - text layout used if empty)
  activityHealthCamp: "",      // Public health outreach & diagnostic drives
  activityEnvironment: "",     // Tree plantation & green campus drives
  activitySwachhata: "",       // Swachh Bharat village sanitation drives
  activityRuralCamp: "",       // Annual rural residential special camp

  // Recent Event Images (Optional - text cards used if empty)
  eventHealthCamp: "",
  eventSwachhata: "",
  eventPlantation: "",
  eventPharmacyRally: "",

  // Media Gallery Photos (Add array of Cloudinary image URLs when ready)
  // Example:
  // galleryPhotos: [
  //   "https://res.cloudinary.com/your-cloud/image/upload/v1/camp1.jpg",
  //   "https://res.cloudinary.com/your-cloud/image/upload/v1/camp2.jpg"
  // ]
  galleryPhotos: []
};
