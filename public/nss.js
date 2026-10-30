/**
 * NSS (National Service Scheme) Portal - Core Module
 * TGPCOP - Echo Campus Media Integration
 */

(function (window) {
  'use strict';

  const NSS = {};

  // Status Badge Helper
  NSS.renderStatusBadge = function (status) {
    const s = (status || 'pending').toLowerCase();
    const label = s.charAt(0).toUpperCase() + s.slice(1);
    return `<span class="nss-badge ${s}">${label}</span>`;
  };

  // Date Formatter
  NSS.formatDate = function (ts, includeTime = false) {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      if (isNaN(d.getTime())) return ts;
      const opts = { day: '2-digit', month: 'short', year: 'numeric' };
      if (includeTime) {
        opts.hour = '2-digit';
        opts.minute = '2-digit';
      }
      return d.toLocaleDateString('en-IN', opts);
    } catch (e) {
      return ts;
    }
  };

  // Helper to ensure Supabase client is ready
  NSS.getSupabase = async function () {
    if (window.getSB && window.getSB()) {
      return window.getSB();
    }
    if (window.ready) {
      await window.ready;
      return window.getSB();
    }
    return null;
  };

  // NSS Authentication & Role Check
  NSS.Auth = {
    async getCurrentUser() {
      const sb = await NSS.getSupabase();
      if (!sb) return null;
      try {
        const { data: { session } } = await sb.auth.getSession();
        return session?.user || null;
      } catch (err) {
        console.error('Error fetching session:', err);
        return null;
      }
    },

    async checkCoordinatorRole(userId) {
      const sb = await NSS.getSupabase();
      if (!sb || !userId) return null;
      try {
        const { data, error } = await sb
          .from('nss_roles')
          .select('role')
          .eq('user_id', userId)
          .maybeSingle();
        if (error || !data) return null;
        return data.role; // 'super_admin' or 'coordinator'
      } catch (err) {
        console.error('Error checking role:', err);
        return null;
      }
    },

    async requireCoordinator(redirectTo = 'nss-login.html') {
      const user = await this.getCurrentUser();
      if (!user) {
        window.location.href = redirectTo;
        return null;
      }
      const role = await this.checkCoordinatorRole(user.id);
      if (!role) {
        window.location.href = redirectTo + '?denied=true';
        return null;
      }
      return { user, role };
    }
  };

  // NSS Applicant Data Access
  NSS.App = {
    async getUserApplication(userId) {
      const sb = await NSS.getSupabase();
      if (!sb || !userId) return null;
      try {
        const { data, error } = await sb
          .from('nss_applications')
          .select('*')
          .eq('user_id', userId)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) {
          console.warn('Error fetching application:', error);
          return null;
        }
        return data;
      } catch (err) {
        console.error('Error in getUserApplication:', err);
        return null;
      }
    },

    async checkRollExists(rollNumber) {
      const sb = await NSS.getSupabase();
      if (!sb) return false;
      try {
        const { data, error } = await sb
          .from('nss_applications')
          .select('id')
          .eq('roll_number', rollNumber.trim().toUpperCase())
          .maybeSingle();
        if (error) return false;
        return !!data;
      } catch (err) {
        return false;
      }
    },

    async submitApplication(formData, photoFile) {
      const sb = await NSS.getSupabase();
      if (!sb) throw new Error('Supabase client unavailable');

      const user = await NSS.Auth.getCurrentUser();
      if (!user) throw new Error('You must be logged in to apply.');

      let photo_url = null;
      let photo_path = null;

      // 1. Upload photo if provided
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() || 'jpg';
        const cleanName = photoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        photo_path = `volunteers/${user.id}_${Date.now()}_${cleanName}`;

        const { data: uploadData, error: uploadErr } = await sb.storage
          .from('nss_photos')
          .upload(photo_path, photoFile, {
            cacheControl: '3600',
            upsert: true
          });

        if (uploadErr) {
          console.warn('Photo upload warning:', uploadErr);
          // Try public or fallback storage path
        }

        // Get public URL
        const { data: publicUrlData } = sb.storage.from('nss_photos').getPublicUrl(photo_path);
        photo_url = publicUrlData?.publicUrl || null;
      }

      // 2. Insert application record
      const payload = {
        user_id: user.id,
        full_name: formData.full_name.trim(),
        roll_number: formData.roll_number.trim().toUpperCase(),
        prn: formData.prn ? formData.prn.trim() : null,
        course: formData.course,
        academic_year: formData.academic_year,
        division: formData.division ? formData.division.trim() : null,
        college_email: formData.college_email.trim().toLowerCase(),
        personal_email: formData.personal_email ? formData.personal_email.trim().toLowerCase() : null,
        mobile: formData.mobile.trim(),
        emergency_contact: formData.emergency_contact ? formData.emergency_contact.trim() : null,
        photo_url: photo_url,
        photo_path: photo_path,
        consent: !!formData.consent,
        status: 'pending'
      };

      const { data, error } = await sb
        .from('nss_applications')
        .insert(payload)
        .select()
        .single();

      if (error) throw error;
      return data;
    }
  };

  // QR Token Verification
  NSS.QRVerify = async function (token) {
    const sb = await NSS.getSupabase();
    if (!sb) {
      return { result: 'invalid', message: 'Supabase client unavailable' };
    }
    const cleanToken = (token || '').trim();
    if (!cleanToken) {
      return { result: 'invalid', message: 'No verification token provided' };
    }

    try {
      const { data, error } = await sb.rpc('nss_verify_token', { p_token: cleanToken });
      if (error) {
        console.warn('RPC verify error:', error);
        return { result: 'invalid', message: error.message };
      }
      return data;
    } catch (err) {
      console.error('Verify token failed:', err);
      return { result: 'invalid', message: 'Verification lookup failed' };
    }
  };

  // QR Verification by Volunteer ID (Public lookup fallback)
  NSS.verifyByVolunteerId = async function (volunteerId) {
    const cleanId = (volunteerId || '').trim().toUpperCase();
    if (!cleanId) return null;

    const sb = await NSS.getSupabase();
    if (sb) {
      try {
        const { data, error } = await sb
          .from('nss_applications')
          .select('full_name, volunteer_id, course, academic_year, photo_url, reviewed_at, status')
          .eq('volunteer_id', cleanId)
          .eq('status', 'approved')
          .maybeSingle();

        if (data && !error) {
          return {
            result: 'approved',
            name: data.full_name,
            volunteer_id: data.volunteer_id,
            course: data.course,
            academic_year: data.academic_year,
            photo_url: data.photo_url || 'assets/nss-logo.png',
            issued_at: data.reviewed_at
          };
        }
      } catch (err) {
        console.warn('DB lookup failed:', err);
      }
    }

    // Lookup in seeds
    const seeds = NSS.getSeedVolunteers();
    const found = seeds.find(s => 
      (s.volunteer_id && s.volunteer_id.toUpperCase() === cleanId) || 
      (s.roll_number && s.roll_number.toUpperCase() === cleanId) ||
      String(s.sr_no) === cleanId
    );

    if (found) {
      return {
        result: 'approved',
        name: found.full_name,
        volunteer_id: found.volunteer_id,
        course: found.course,
        academic_year: found.academic_year,
        photo_url: 'assets/nss-logo.png',
        issued_at: new Date(Date.now() - 30 * 86400000).toISOString()
      };
    }

    return null;
  };

  // Official Enrolled Volunteers Seed Integration
  NSS.getSeedVolunteers = function () {
    return window.NSS_VOLUNTEERS_DATA || [];
  };

  NSS.mergeVolunteers = function (dbList = []) {
    const seeds = NSS.getSeedVolunteers();
    const seenRolls = new Set();
    const seenIds = new Set();
    const seenEmails = new Set();
    const result = [];

    // Prioritize DB list
    if (Array.isArray(dbList)) {
      for (const item of dbList) {
        if (!item) continue;
        if (item.roll_number) seenRolls.add(String(item.roll_number).trim().toUpperCase());
        if (item.college_email) seenEmails.add(String(item.college_email).trim().toLowerCase());
        if (item.id) seenIds.add(String(item.id));
        result.push(item);
      }
    }

    // Add seeds that aren't already in DB list
    for (const s of seeds) {
      const roll = String(s.roll_number || '').trim().toUpperCase();
      const email = String(s.college_email || '').trim().toLowerCase();
      if (roll && seenRolls.has(roll)) continue;
      if (email && seenEmails.has(email)) continue;

      result.push({
        id: 'seed-' + s.sr_no,
        ref_code: s.ref_code,
        volunteer_id: s.volunteer_id,
        full_name: s.full_name,
        parent_name: s.parent_name,
        roll_number: s.roll_number,
        prn: s.prn,
        masked_aadhar: s.masked_aadhar,
        course: s.course || 'B.Pharm',
        academic_year: s.academic_year || 'FY',
        class_label: s.class_label,
        division: s.division || 'A',
        college_email: s.college_email,
        personal_email: s.personal_email,
        mobile: s.mobile,
        emergency_contact: s.emergency_contact,
        photo_url: 'assets/nss-logo.png',
        status: 'approved',
        submitted_at: new Date(Date.now() - (50 - s.sr_no) * 86400000).toISOString(),
        reviewed_at: new Date(Date.now() - (50 - s.sr_no) * 86400000).toISOString(),
        interests: s.interests,
        address: s.full_address || s.address,
        blood_group: s.blood_group
      });
    }

    return result;
  };

  // NSS Admin Operations
  NSS.Admin = {
    async loadStats() {
      const sb = await NSS.getSupabase();
      let dbData = [];
      if (sb) {
        try {
          const { data } = await sb.from('nss_applications').select('*');
          if (data && data.length) dbData = data;
        } catch (e) {
          console.warn('DB stats query error:', e);
        }
      }

      const merged = NSS.mergeVolunteers(dbData);
      const counts = { total: merged.length, pending: 0, approved: 0, rejected: 0, revoked: 0 };
      merged.forEach(item => {
        if (counts[item.status] !== undefined) {
          counts[item.status]++;
        }
      });
      return counts;
    },

    async loadPending() {
      const sb = await NSS.getSupabase();
      let dbData = [];
      if (sb) {
        try {
          const { data } = await sb
            .from('nss_applications')
            .select('*')
            .eq('status', 'pending')
            .order('submitted_at', { ascending: true });
          if (data && data.length) dbData = data;
        } catch (e) {
          console.warn('DB loadPending query error:', e);
        }
      }
      return dbData;
    },

    async loadAll(statusFilter = 'all', searchQuery = '') {
      const sb = await NSS.getSupabase();
      let dbData = [];
      if (sb) {
        try {
          const { data } = await sb.from('nss_applications').select('*').order('submitted_at', { ascending: false });
          if (data && data.length) dbData = data;
        } catch (e) {
          console.warn('DB loadAll query error:', e);
        }
      }

      let list = NSS.mergeVolunteers(dbData);

      if (statusFilter && statusFilter !== 'all') {
        list = list.filter(item => item.status === statusFilter);
      }

      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        list = list.filter(item =>
          (item.full_name && item.full_name.toLowerCase().includes(q)) ||
          (item.roll_number && item.roll_number.toLowerCase().includes(q)) ||
          (item.ref_code && item.ref_code.toLowerCase().includes(q)) ||
          (item.volunteer_id && item.volunteer_id.toLowerCase().includes(q)) ||
          (item.college_email && item.college_email.toLowerCase().includes(q)) ||
          (item.mobile && item.mobile.includes(q))
        );
      }

      return list;
    },
      const sb = await NSS.getSupabase();
      if (!sb) return [];

      let query = sb.from('nss_applications').select('*');

      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (searchQuery && searchQuery.trim()) {
        const q = searchQuery.trim();
        query = query.or(`full_name.ilike.%${q}%,roll_number.ilike.%${q}%,ref_code.ilike.%${q}%,volunteer_id.ilike.%${q}%`);
      }

      query = query.order('submitted_at', { ascending: false });

      const { data, error } = await query;
      if (error) {
        console.error('Error loading applications:', error);
        return [];
      }
      return data || [];
    },

    async approveApp(appId) {
      const sb = await NSS.getSupabase();
      if (!sb) throw new Error('Supabase client unavailable');
      const { data, error } = await sb.rpc('nss_approve_volunteer', { app_id: appId });
      if (error) throw error;
      return data; // { volunteer_id, qr_token }
    },

    async rejectApp(appId, reason = '') {
      const sb = await NSS.getSupabase();
      if (!sb) throw new Error('Supabase client unavailable');
      const { error } = await sb.rpc('nss_reject_volunteer', {
        app_id: appId,
        reason: reason || 'Application does not meet criteria'
      });
      if (error) throw error;
      return true;
    },

    async revokeCard(appId, reason = '') {
      const sb = await NSS.getSupabase();
      if (!sb) throw new Error('Supabase client unavailable');
      const { error } = await sb.rpc('nss_revoke_card', {
        app_id: appId,
        reason: reason || 'Card revoked by administration'
      });
      if (error) throw error;
      return true;
    },

    async loadLeadership() {
      const sb = await NSS.getSupabase();
      if (!sb) return [];
      const { data, error } = await sb
        .from('nss_leadership')
        .select('*')
        .order('display_order', { ascending: true });
      if (error) {
        console.warn('Error loading leadership:', error);
        return [];
      }
      return data || [];
    },

    async saveLeadership(item, photoFile = null) {
      const sb = await NSS.getSupabase();
      if (!sb) throw new Error('Supabase client unavailable');

      let photo_url = item.photo_url || null;
      let photo_path = item.photo_path || null;

      if (photoFile) {
        const cleanName = photoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        photo_path = `leadership/${Date.now()}_${cleanName}`;
        await sb.storage.from('nss_leadership_photos').upload(photo_path, photoFile, { upsert: true });
        const { data: pData } = sb.storage.from('nss_leadership_photos').getPublicUrl(photo_path);
        photo_url = pData?.publicUrl || photo_url;
      }

      const payload = {
        name: item.name,
        designation: item.designation,
        department: item.department || null,
        bio: item.bio || null,
        photo_url: photo_url,
        photo_path: photo_path,
        display_order: parseInt(item.display_order, 10) || 0,
        published: !!item.published
      };

      if (item.id) {
        const { error } = await sb.from('nss_leadership').update(payload).eq('id', item.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from('nss_leadership').insert(payload);
        if (error) throw error;
      }
      return true;
    },

    async deleteLeadership(id) {
      const sb = await NSS.getSupabase();
      if (!sb) throw new Error('Supabase client unavailable');
      const { error } = await sb.from('nss_leadership').delete().eq('id', id);
      if (error) throw error;
      return true;
    },

    async exportApprovedCSV() {
      const list = await this.loadAll('approved');
      if (!list || !list.length) {
        alert('No approved volunteers found to export.');
        return;
      }

      const headers = ['Volunteer ID', 'Full Name', 'Roll Number', 'Course', 'Year', 'Division', 'College Email', 'Mobile', 'Blood Group', 'Interests', 'Approved Date'];
      const rows = list.map(r => [
        `"${r.volunteer_id || ''}"`,
        `"${r.full_name || ''}"`,
        `"${r.roll_number || ''}"`,
        `"${r.course || ''}"`,
        `"${r.academic_year || ''}"`,
        `"${r.division || ''}"`,
        `"${r.college_email || ''}"`,
        `"${r.mobile || ''}"`,
        `"${r.blood_group || ''}"`,
        `"${(r.interests || '').replace(/"/g, '""')}"`,
        `"${r.reviewed_at ? new Date(r.reviewed_at).toLocaleDateString('en-IN') : ''}"`
      ]);

      const csvContent = [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `nss_tgpcop_volunteers_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  // QR Scanner Controller
  NSS.QRScanner = {
    stream: null,
    animationFrameId: null,
    isScanning: false,

    async loadJsQR() {
      if (window.jsQR) return window.jsQR;
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
        script.onload = () => resolve(window.jsQR);
        script.onerror = () => reject(new Error('Failed to load jsQR library'));
        document.head.appendChild(script);
      });
    },

    async start(videoElement, onDetected, onError) {
      try {
        await this.loadJsQR();
        this.stop(); // Clean any active stream

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        this.stream = stream;
        videoElement.srcObject = stream;
        videoElement.setAttribute('playsinline', 'true');
        await videoElement.play();

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        this.isScanning = true;

        const scanLoop = () => {
          if (!this.isScanning) return;
          if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert'
            });

            if (code && code.data) {
              this.stop();
              if (typeof onDetected === 'function') {
                onDetected(code.data);
              }
              return;
            }
          }
          this.animationFrameId = requestAnimationFrame(scanLoop);
        };

        this.animationFrameId = requestAnimationFrame(scanLoop);
      } catch (err) {
        console.error('Camera start error:', err);
        if (typeof onError === 'function') {
          onError(err);
        }
      }
    },

    stop() {
      this.isScanning = false;
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
        this.stream = null;
      }
    }
  };

  // Initialize and enhance NSS Navbar with auth status
  NSS.initNav = async function () {
    try {
      const user = await NSS.Auth.getCurrentUser();
      const btn = document.querySelector('.nss-subnav-btn');
      const links = document.querySelector('.nss-subnav-links');
      if (user && links) {
        const isCoord = await NSS.Auth.checkCoordinatorRole(user.id);
        if (btn) {
          if (isCoord) {
            btn.textContent = 'Admin Panel';
            btn.href = 'admin.html';
            const outBtn = document.createElement('a');
            outBtn.className = 'nss-subnav-link';
            outBtn.textContent = 'Sign Out';
            outBtn.href = '#';
            outBtn.onclick = async (e) => {
              e.preventDefault();
              const sb = await NSS.getSupabase();
              if (sb) await sb.auth.signOut();
              window.location.reload();
            };
            links.appendChild(outBtn);
          } else {
            btn.textContent = 'Sign Out';
            btn.href = '#';
            btn.onclick = async (e) => {
              e.preventDefault();
              const sb = await NSS.getSupabase();
              if (sb) await sb.auth.signOut();
              window.location.reload();
            };
          }
        }
      }
    } catch (e) {
      console.warn('NSS.initNav error:', e);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { setTimeout(NSS.initNav, 300); });
  } else {
    setTimeout(NSS.initNav, 300);
  }

  // Expose NSS object globally
  
  // NSS Parallax & Dynamic Wash Scroll Engine
  NSS.initScrollScene = function () {
    const image = document.getElementById('sceneImage');
    const particles = document.getElementById('particles');
    const orbs = [...document.querySelectorAll('.orb')];
    const sections = [...document.querySelectorAll('section[data-section]')];
    if (!image && orbs.length === 0) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let ticking = false;

    function update() {
      const y = window.scrollY || 0;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const progress = Math.min(1, y / max);

      if (!reduceMotion && image) {
        image.style.setProperty('--image-y', (-y * 0.075) + 'px');
        image.style.setProperty('--image-scale', (1.04 + progress * 0.035).toString());
        if (particles) {
          particles.style.setProperty('--dots-y', (-y * 0.12) + 'px');
        }
        orbs.forEach(orb => {
          const speed = Number(orb.dataset.speed || 0.1);
          orb.style.transform = 'translate3d(0, ' + (y * speed) + 'px, 0) rotate(' + (y * 0.018) + 'deg)';
        });
      }

      sections.forEach(section => {
        const rect = section.getBoundingClientRect();
        const center = rect.top + rect.height / 2;
        const distance = Math.abs(window.innerHeight / 2 - center);
        section.style.setProperty('--wash', (Math.max(0, 1 - distance / (window.innerHeight * 0.75)) * 0.45).toFixed(3));
      });

      ticking = false;
    }

    function requestUpdate() {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(update);
      }
    }

    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);
    update();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', NSS.initScrollScene);
  } else {
    NSS.initScrollScene();
  }

  
    // NSS Cloudinary Asset Integrator
  NSS.applyCloudinaryAssets = function () {
    const cfg = window.NSS_CLOUDINARY_CONFIG;
    if (!cfg) return;

    // 1. President Portrait
    const presImg = document.getElementById('presidentPortraitImg');
    if (presImg && cfg.presidentPortrait && typeof cfg.presidentPortrait === 'string' && cfg.presidentPortrait.trim() !== '') {
      presImg.src = cfg.presidentPortrait.trim();
    }

    // 2. Event Media Cards
    const eventImg = document.getElementById('eventHealthCampImg');
    if (eventImg && cfg.eventHealthCamp && typeof cfg.eventHealthCamp === 'string' && cfg.eventHealthCamp.trim() !== '') {
      eventImg.src = cfg.eventHealthCamp.trim();
    }

    // 3. Media Gallery Section
    const galleryGrid = document.getElementById('nssGalleryGrid');
    const galleryNotice = document.getElementById('nssGalleryNotice');
    if (galleryGrid) {
      const rawPhotos = Array.isArray(cfg.galleryPhotos) ? cfg.galleryPhotos : [];
      const photos = rawPhotos.map((item, idx) => {
        if (typeof item === 'string' && item.trim()) {
          return {
            url: item.trim(),
            thumb: item.trim(),
            caption: 'NSS Blood Donation Camp — Field Photo ' + (idx + 1),
            tag: 'Blood Donation Camp'
          };
        }
        if (item && typeof item === 'object' && item.url) {
          return {
            url: item.url.trim(),
            thumb: item.thumb ? item.thumb.trim() : item.url.trim(),
            caption: item.caption || ('NSS Blood Donation Camp — Field Photo ' + (idx + 1)),
            tag: item.tag || 'Blood Donation Camp'
          };
        }
        return null;
      }).filter(Boolean);

      if (photos.length > 0) {
        if (galleryNotice) galleryNotice.style.display = 'none';
        galleryGrid.style.display = 'grid';
        galleryGrid.innerHTML = photos.map((item, i) =>
          '<div class="nss-gallery-item" onclick="viewPhoto(\'' + item.url + '\', \'' + item.caption.replace(/'/g, "\\'") + '\')" role="button" tabindex="0" aria-label="' + item.caption.replace(/"/g, '&quot;') + '">' +
            '<img src="' + item.thumb + '" alt="' + item.caption.replace(/"/g, '&quot;') + '" loading="lazy">' +
            '<div class="nss-gallery-overlay">' +
              '<span class="nss-gallery-tag">' + item.tag + '</span>' +
              '<span class="nss-gallery-caption">' + item.caption + '</span>' +
            '</div>' +
          '</div>'
        ).join('');
      } else {
        galleryGrid.style.display = 'none';
        if (galleryNotice) galleryNotice.style.display = 'block';
      }
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', NSS.applyCloudinaryAssets);
  } else {
    NSS.applyCloudinaryAssets();
  }

  
  // Dynamic footer year helper
  function updateFooterYear() {
    try {
      const yr = new Date().getFullYear();
      document.querySelectorAll('.nss-dynamic-year').forEach(el => {
        el.textContent = yr;
      });
    } catch (e) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateFooterYear);
  } else {
    updateFooterYear();
  }

  window.NSS = NSS;

})(window);
