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
  // Cloudinary cloud name
  cloudName: "axgam8br",

  // Leadership & Desk Portraits (Real president portrait configured)
  presidentPortrait: "assets/president.jpg",
  programOfficerPortrait: "",

  // Core NSS Domain Feature Images
  activityHealthCamp: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_800/v1793047208/IMG_1159.jpg",
  activityEnvironment: "",
  activitySwachhata: "",
  activityRuralCamp: "",

  // Recent Event Images
  eventHealthCamp: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_800/v1793047208/IMG_1159.jpg",
  eventSwachhata: "",
  eventPlantation: "",
  eventPharmacyRally: "",

  // Media Gallery Photos (All 8 Blood Donation Camp photos from Cloudinary with auto optimization)
  galleryPhotos: [
    {
      url: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_1200/v1793047208/IMG_1159.jpg",
      thumb: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_600/v1793047208/IMG_1159.jpg",
      caption: "Blood Donation Camp — Volunteer Registration & Donor Screening",
      tag: "Blood Donation Camp"
    },
    {
      url: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_1200/v1793047210/IMG_1155.jpg",
      thumb: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_600/v1793047210/IMG_1155.jpg",
      caption: "Blood Donation Camp — Medical Officer Vitals & Hemoglobin Check",
      tag: "Blood Donation Camp"
    },
    {
      url: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_1200/v1793047211/IMG_1154.jpg",
      thumb: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_600/v1793047211/IMG_1154.jpg",
      caption: "Blood Donation Camp — Student Donors Actively Participating",
      tag: "Blood Donation Camp"
    },
    {
      url: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_1200/v1793047212/IMG_1150.jpg",
      thumb: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_600/v1793047212/IMG_1150.jpg",
      caption: "Blood Donation Camp — Clinical Phlebotomy & Safe Collection",
      tag: "Blood Donation Camp"
    },
    {
      url: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_1200/v1793047214/IMG_1146.jpg",
      thumb: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_600/v1793047214/IMG_1146.jpg",
      caption: "Blood Donation Camp — Student Volunteer Team & Supervision",
      tag: "Blood Donation Camp"
    },
    {
      url: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_1200/v1793047214/IMG_1143.jpg",
      thumb: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_600/v1793047214/IMG_1143.jpg",
      caption: "Blood Donation Camp — Post-Donation Refreshment & Donor Care",
      tag: "Blood Donation Camp"
    },
    {
      url: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_1200/v1793047215/IMG_1132.jpg",
      thumb: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_600/v1793047215/IMG_1132.jpg",
      caption: "Blood Donation Camp — Donor Recognition & Certificate Desk",
      tag: "Blood Donation Camp"
    },
    {
      url: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_1200/v1793047224/IMG_1104.jpg",
      thumb: "https://res.cloudinary.com/axgam8br/image/upload/f_auto,q_auto,w_600/v1793047224/IMG_1104.jpg",
      caption: "Blood Donation Camp — Student Council & NSS Organizing Unit",
      tag: "Blood Donation Camp"
    }
  ]
};
