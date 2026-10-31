/**
 * NSS (National Service Scheme) Portal - Core Module
 * TGPCOP - Tulsiramji Gaikwad-Patil College of Pharmacy, Nagpur
 * Comprehensive Security, RBAC, Student Registry & Admin Operations
 */

var NSS = (typeof window !== 'undefined' ? (window.NSS = window.NSS || {}) : {});

(function (window) {
  'use strict';

  var NSS = window.NSS = window.NSS || {};
  var nssAnonClient;

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
    if (typeof window !== 'undefined') {
      if (window.ready) await window.ready;
      if (typeof window.getSB === 'function') {
        const client = window.getSB();
        if (client) return client;
      }
      if (window.supabase && window.__ENV__?.SUPABASE_URL && window.__ENV__?.SUPABASE_ANON_KEY) {
        return window.supabase.createClient(window.__ENV__.SUPABASE_URL, window.__ENV__.SUPABASE_ANON_KEY);
      }
    }
    return null;
  };

  // ==============================================================================
  // 1. NSS AUTHENTICATION & DATABASE-BACKED RBAC
  // ==============================================================================
  NSS.Auth = {
    async getCurrentUser() {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) return null;
      try {
        const { data: { session } } = await sb.auth.getSession();
        return session?.user || null;
      } catch (err) {
        console.error('Error fetching session:', err);
        return null;
      }
    },

    /**
     * Resolves user's database-backed role from Supabase:
     * Roles: 'super_admin' | 'coordinator' | 'president' | 'faculty' | 'volunteer'
     * Automatically attempts invitation activation for invited emails (e.g. President)
     */
    async getUserRole(userId = null) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) return 'volunteer';
      try {
        let user = null;
        if (userId && typeof userId === 'object' && userId.id) {
          user = userId;
        } else if (typeof userId === 'string') {
          const current = await this.getCurrentUser();
          user = (current && current.id === userId) ? current : { id: userId, email: current?.email };
        } else {
          user = await this.getCurrentUser();
        }
        if (!user || !user.id) return 'volunteer';

        const emailLower = (user.email || '').toLowerCase().trim();

        // Immediate hardcoded fallback for primary leadership accounts
        if (emailLower === 'shivamw2005@gmail.com' || emailLower === 'nss-president@tgpcop.site') {
          return 'president';
        }
        if (emailLower === 'shreyashborkar2006@gmail.com' || emailLower === 'shreyashborkar2005@gmail.com' || emailLower === 'shreyash20006@gmail.com') {
          return 'super_admin';
        }

        // 1. Query assigned role from nss_roles table
        const { data, error } = await sb
          .from('nss_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();

        if (data && data.role) return data.role;

        // 2. If no role found, trigger server-side invitation activation RPC
        if (emailLower) {
          try {
            const { data: activatedRole } = await sb.rpc('nss_check_and_activate_invitation', {
              p_user_id: user.id,
              p_email: emailLower
            });
            if (activatedRole && activatedRole !== 'volunteer') {
              return activatedRole;
            }
          } catch (e) {
            // RPC not deployed yet or non-fatal
          }
        }

        return 'volunteer';
      } catch (err) {
        console.error('Error resolving user role:', err);
        return 'volunteer';
      }
    },

    /**
     * Check if user has administrative or coordinator authority
     */
    async checkCoordinatorRole(userId) {
      const role = await this.getUserRole(userId);
      if (['super_admin', 'coordinator', 'president'].includes(role)) {
        return role;
      }
      return null;
    },

    /**
     * Staff Auth Guard: enforces least-privilege server-verified role access
     */
    async requireStaff(allowedRoles = ['super_admin', 'coordinator', 'president']) {
      const user = await this.getCurrentUser();
      if (!user) {
        window.location.href = 'login.html';
        return null;
      }
      const role = await this.getUserRole(user.id);
      if (!allowedRoles.includes(role)) {
        return { user, role, authorized: false };
      }
      return { user, role, authorized: true };
    },

    async requireCoordinator(redirectTo = 'login.html') {
      const res = await this.requireStaff(['super_admin', 'coordinator', 'president']);
      if (!res) return null;
      if (!res.authorized) {
        window.location.href = redirectTo + (redirectTo.includes('?') ? '&' : '?') + 'denied=true';
        return null;
      }
      return { user: res.user, role: res.role };
    },

    /**
     * Records Google login activity via secure RPC
     */
    async recordLogin() {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) return;
      try {
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        await sb.rpc('nss_record_login', { p_user_agent: ua });
      } catch (err) {
        // Non-blocking log
      }
    },

    async signOut() {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (sb) {
        await sb.auth.signOut();
      }
      window.location.href = 'login.html';
    }
  };

  // ==============================================================================
  // 2. VOLUNTEER APPLICANT DATA ACCESS
  // ==============================================================================
  NSS.App = {
    async getUserApplication(userId) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb || !userId) return null;
      try {
        const { data, error } = await sb
          .from('nss_applications')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw error;
        return data;
      } catch (err) {
        console.error('Error fetching application:', err);
        return null;
      }
    },

    normalizeRollNumber(rollNumber) {
      if (typeof rollNumber !== 'string') {
        throw new Error('Enter a valid college roll number.');
      }
      const normalized = rollNumber.trim().toUpperCase();
      if (!normalized || normalized.length > 50 || !/^[A-Z0-9][A-Z0-9 /_-]*$/.test(normalized)) {
        throw new Error('Enter a valid college roll number.');
      }
      return normalized;
    },

    async checkExistingByRoll(rollNumber) {
      const normalized = this.normalizeRollNumber(rollNumber);
      const sb = await NSS.getSupabase();
      if (!sb) {
        throw new Error('Roll number verification is unavailable. Please try again.');
      }

      try {
        // RLS limits authenticated applicants to their own application. Check it first,
        // then use the existing anon SELECT policy on nss_students for registry matches.
        const { data: application, error: applicationError } = await sb
          .from('nss_applications')
          .select('id, full_name, status, roll_number')
          .eq('roll_number', normalized)
          .maybeSingle();
        if (applicationError) throw applicationError;
        if (application) return application;

        const env = window.__ENV__ || {};
        if (!nssAnonClient) {
          if (typeof window.supabase?.createClient !== 'function' || !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
            throw new Error('Supabase anonymous client is unavailable.');
          }
          nssAnonClient = window.supabase.createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
          });
        }

        const { data: student, error: studentError } = await nssAnonClient
          .from('nss_students')
          .select('roll_number, application_status')
          .eq('roll_number', normalized)
          .maybeSingle();
        if (studentError) throw studentError;
        if (student) {
          return {
            id: null,
            full_name: null,
            status: student.application_status || 'registered',
            roll_number: student.roll_number
          };
        }
        return null;
      } catch (error) {
        console.error('Roll number verification failed:', error);
        throw new Error('Unable to verify this roll number right now. Check your connection and try again.');
      }
    },

    async checkRollExists(rollNumber) {
      return Boolean(await this.checkExistingByRoll(rollNumber));
    },

    async submitApplication(appData) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) throw new Error('Database client unavailable');
      const user = await NSS.Auth.getCurrentUser();
      if (!user) throw new Error('Authentication required before submitting application.');

      const cleanRoll = this.normalizeRollNumber(String(appData.roll_number || ''));
      const cleanPrn = String(appData.prn || '').trim();
      if (!cleanPrn) {
        throw new Error('University PRN is required to submit an NSS application.');
      }
      const existing = await this.checkExistingByRoll(cleanRoll);
      if (existing) {
        throw new Error(`An application with Roll Number ${cleanRoll} is already registered (${existing.status.toUpperCase()}).`);
      }

      const insertPayload = {
        user_id: user.id,
        full_name: String(appData.full_name || '').trim(),
        roll_number: cleanRoll,
        prn: cleanPrn,
        course: appData.course || 'B.Pharm',
        academic_year: appData.academic_year || 'FY',
        division: appData.division ? String(appData.division).trim() : 'A',
        college_email: String(appData.college_email || user.email || '').trim().toLowerCase(),
        personal_email: appData.personal_email ? String(appData.personal_email).trim().toLowerCase() : null,
        mobile: String(appData.mobile || '').trim(),
        emergency_contact: appData.emergency_contact ? String(appData.emergency_contact).trim() : null,
        photo_url: appData.photo_url || null,
        photo_path: appData.photo_path || null,
        consent: Boolean(appData.consent),
        status: 'pending',
        submitted_at: new Date().toISOString()
      };

      const { data, error } = await sb
        .from('nss_applications')
        .insert(insertPayload)
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error(`An application with Roll Number ${cleanRoll} is already registered.`);
        }
        throw error;
      }

      // Also upsert into centralized nss_students registry
      try {
        await sb.from('nss_students').upsert({
          user_id: user.id,
          full_name: insertPayload.full_name,
          roll_number: insertPayload.roll_number,
          prn: insertPayload.prn,
          course: insertPayload.course,
          academic_year: insertPayload.academic_year,
          division: insertPayload.division,
          college_email: insertPayload.college_email,
          google_email: user.email,
          mobile: insertPayload.mobile,
          registration_id: data.id,
          application_status: 'pending',
          data_source: 'web_registration',
          updated_at: new Date().toISOString()
        }, { onConflict: 'roll_number' });
      } catch (e) {
        console.warn('Sync to nss_students non-fatal:', e);
      }

      return data;
    }
  };

  // ==============================================================================
  // 3. VOLUNTEER SELF-SERVICE PROFILE & PRIVATE EVENT PHOTOS
  // ==============================================================================
  NSS.Profile = {
    bucket: 'nss-profile-media',
    maxPhotoBytes: 5 * 1024 * 1024,

    async getContext() {
      const sb = await NSS.getSupabase();
      const user = await NSS.Auth.getCurrentUser();
      if (!sb || !user) throw new Error('Please sign in to manage your profile.');
      return { sb, user };
    },

    validateImage(file) {
      const supportedTypes = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
      };
      if (!file || !supportedTypes[file.type]) {
        throw new Error('Choose a JPG, PNG, or WebP image.');
      }
      if (file.size > this.maxPhotoBytes) {
        throw new Error('Each image must be 5 MB or smaller.');
      }
      return supportedTypes[file.type];
    },

    makePhotoPath(userId, section, extension) {
      const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      return `${userId}/${section}/${id}.${extension}`;
    },

    async load() {
      const { sb, user } = await this.getContext();
      const { data: existing, error } = await sb
        .from('nss_student_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;

      const application = await NSS.App.getUserApplication(user.id);
      const profile = existing || {
        user_id: user.id,
        full_name: application?.full_name || user.user_metadata?.full_name || '',
        prn: application?.prn || '',
        mobile: application?.mobile || null,
        profile_photo_path: null
      };

      let photoUrl = application?.photo_url || user.user_metadata?.avatar_url || '';
      if (profile.profile_photo_path) {
        const { data: signed, error: signError } = await sb.storage
          .from(this.bucket)
          .createSignedUrl(profile.profile_photo_path, 3600);
        if (signError) throw signError;
        photoUrl = signed.signedUrl;
      }
      return { profile, photoUrl, email: user.email || '', application };
    },

    async save(fields) {
      const { sb, user } = await this.getContext();
      const fullName = String(fields.full_name || '').trim();
      const prn = String(fields.prn || '').trim();
      const mobile = String(fields.mobile || '').trim();
      if (!fullName) throw new Error('Full name is required.');
      if (!prn) throw new Error('PRN is required. Add your university PRN before saving.');
      if (mobile && !/^\d{10}$/.test(mobile)) throw new Error('Enter a valid 10-digit mobile number.');

      const current = await this.load();
      const { data, error } = await sb
        .from('nss_student_profiles')
        .upsert({
          user_id: user.id,
          full_name: fullName,
          prn,
          mobile: mobile || null,
          profile_photo_path: current.profile.profile_photo_path || null,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },

    async uploadProfilePhoto(file) {
      const extension = this.validateImage(file);
      const { sb, user } = await this.getContext();
      const current = await this.load();
      if (!current.profile.full_name.trim() || !current.profile.prn.trim()) {
        throw new Error('Save your name and university PRN before uploading a profile photo.');
      }
      const path = this.makePhotoPath(user.id, 'profile', extension);
      const { error: uploadError } = await sb.storage.from(this.bucket).upload(path, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });
      if (uploadError) throw uploadError;

      const { data: updated, error: updateError } = await sb
        .from('nss_student_profiles')
        .upsert({
          user_id: user.id,
          full_name: current.profile.full_name || user.user_metadata?.full_name || '',
          prn: current.profile.prn || '',
          mobile: current.profile.mobile || null,
          profile_photo_path: path,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (updateError) {
        await sb.storage.from(this.bucket).remove([path]);
        throw updateError;
      }

      if (current.profile.profile_photo_path && current.profile.profile_photo_path !== path) {
        const { error: removeError } = await sb.storage.from(this.bucket).remove([current.profile.profile_photo_path]);
        if (removeError) console.warn('Old profile image cleanup failed:', removeError);
      }
      const { data: signed, error: signError } = await sb.storage.from(this.bucket).createSignedUrl(path, 3600);
      if (signError) throw signError;
      return { profile: updated, photoUrl: signed.signedUrl };
    },

    async uploadEventPhoto(file, caption = '') {
      const extension = this.validateImage(file);
      const cleanCaption = String(caption || '').trim().slice(0, 180);
      const { sb, user } = await this.getContext();
      const path = this.makePhotoPath(user.id, 'events', extension);
      const { error: uploadError } = await sb.storage.from(this.bucket).upload(path, file, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });
      if (uploadError) throw uploadError;

      const { data, error } = await sb
        .from('nss_profile_event_photos')
        .insert({ user_id: user.id, photo_path: path, caption: cleanCaption || null })
        .select('*')
        .single();
      if (error) {
        await sb.storage.from(this.bucket).remove([path]);
        throw error;
      }
      const { data: signed, error: signError } = await sb.storage.from(this.bucket).createSignedUrl(path, 3600);
      if (signError) throw signError;
      return { ...data, photoUrl: signed.signedUrl };
    },

    async listEventPhotos() {
      const { sb, user } = await this.getContext();
      const { data, error } = await sb
        .from('nss_profile_event_photos')
        .select('id, photo_path, caption, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return Promise.all((data || []).map(async photo => {
        const { data: signed, error: signError } = await sb.storage
          .from(this.bucket)
          .createSignedUrl(photo.photo_path, 3600);
        if (signError) throw signError;
        return { ...photo, photoUrl: signed.signedUrl };
      }));
    }
  };

  // ==============================================================================
  // 4. CENTRALIZED STUDENT REGISTRY (nss_students)
  // ==============================================================================
  NSS.Students = {
    async loadStudentsFromApplications({ page = 1, limit = 50, search = '', status = 'all', course = 'all', academicYear = 'all' } = {}) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) return { students: [], total: 0, page: 1, totalPages: 1 };

      try {
        let query = sb.from('nss_applications').select('*', { count: 'exact' });
        if (status && status !== 'all') {
          query = query.eq('status', status);
        }
        if (course && course !== 'all') {
          query = query.eq('course', course);
        }
        if (academicYear && academicYear !== 'all') {
          query = query.eq('academic_year', academicYear);
        }
        if (search && search.trim()) {
          const q = search.trim();
          query = query.or(`full_name.ilike.%${q}%,roll_number.ilike.%${q}%,prn.ilike.%${q}%,college_email.ilike.%${q}%,mobile.ilike.%${q}%`);
        }

        const from = (page - 1) * limit;
        const to = from + limit - 1;
        query = query.order('submitted_at', { ascending: false }).range(from, to);

        const { data, count, error } = await query;
        if (error) throw error;

        const mapped = (data || []).map(a => ({
          id: a.id,
          user_id: a.user_id,
          full_name: a.full_name,
          roll_number: a.roll_number,
          prn: a.prn,
          course: a.course,
          academic_year: a.academic_year,
          division: a.division,
          college_email: a.college_email,
          google_email: a.college_email,
          mobile: a.mobile,
          application_status: a.status,
          volunteer_id: a.volunteer_id,
          registration_id: a.id,
          created_at: a.submitted_at
        }));

        return {
          students: mapped,
          total: count || mapped.length,
          page,
          totalPages: Math.ceil((count || mapped.length) / limit) || 1
        };
      } catch (err) {
        console.warn('Fallback student query error:', err);
        return { students: [], total: 0, page: 1, totalPages: 1, error: err.message };
      }
    },

    async loadStudents({ page = 1, limit = 50, search = '', status = 'all', course = 'all', academicYear = 'all' } = {}) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) return { students: [], total: 0, page, totalPages: 1 };

      try {
        let query = sb.from('nss_students').select('*', { count: 'exact' });

        if (status && status !== 'all') {
          query = query.eq('application_status', status);
        }
        if (course && course !== 'all') {
          query = query.eq('course', course);
        }
        if (academicYear && academicYear !== 'all') {
          query = query.eq('academic_year', academicYear);
        }

        if (search && search.trim()) {
          const q = search.trim();
          query = query.or(`full_name.ilike.%${q}%,roll_number.ilike.%${q}%,prn.ilike.%${q}%,college_email.ilike.%${q}%,google_email.ilike.%${q}%,mobile.ilike.%${q}%`);
        }

        const from = (page - 1) * limit;
        const to = from + limit - 1;
        query = query.order('created_at', { ascending: false }).range(from, to);

        const { data, count, error } = await query;
        if (error) {
          return await this.loadStudentsFromApplications({ page, limit, search, status, course, academicYear });
        }

        return {
          students: data || [],
          total: count || 0,
          page,
          totalPages: Math.ceil((count || 0) / limit) || 1
        };
      } catch (err) {
        return await this.loadStudentsFromApplications({ page, limit, search, status, course, academicYear });
      }
    },

    async getStudentById(studentId) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb || !studentId) return null;
      try {
        const { data, error } = await sb.from('nss_students').select('*').eq('id', studentId).maybeSingle();
        if (!error && data) return data;
      } catch (e) {}

      try {
        const { data: a } = await sb.from('nss_applications').select('*').eq('id', studentId).maybeSingle();
        if (a) {
          return {
            id: a.id,
            user_id: a.user_id,
            full_name: a.full_name,
            roll_number: a.roll_number,
            prn: a.prn,
            course: a.course,
            academic_year: a.academic_year,
            division: a.division,
            college_email: a.college_email,
            mobile: a.mobile,
            application_status: a.status,
            volunteer_id: a.volunteer_id,
            registration_id: a.id
          };
        }
      } catch (e) {}
      return null;
    },

    async updateStudent(studentId, fields) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb || !studentId) throw new Error('Database unavailable');
      const { data, error } = await sb
        .from('nss_students')
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq('id', studentId)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    exportStudentsCSV(studentList) {
      if (!studentList || !studentList.length) return;
      const headers = ['Full Name', 'Roll Number', 'PRN', 'Course', 'Year', 'Division', 'College Email', 'Google Email', 'Mobile', 'Volunteer Status', 'Volunteer ID', 'Last Login'];
      const rows = studentList.map(s => [
        `"${(s.full_name || '').replace(/"/g, '""')}"`,
        `"${s.roll_number || ''}"`,
        `"${s.prn || ''}"`,
        `"${s.course || ''}"`,
        `"${s.academic_year || ''}"`,
        `"${s.division || ''}"`,
        `"${s.college_email || ''}"`,
        `"${s.google_email || ''}"`,
        `"${s.mobile || ''}"`,
        `"${s.application_status || ''}"`,
        `"${s.volunteer_id || ''}"`,
        `"${s.last_login_at ? new Date(s.last_login_at).toLocaleString('en-IN') : 'Never'}"`
      ]);
      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NSS_Students_Export_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // ==============================================================================
  // 4. LOGIN TRACKING API (nss_login_activity)
  // ==============================================================================
  NSS.LoginActivity = {
    async loadActivity({ page = 1, limit = 20, role = 'all', isRegistered = 'all', search = '' } = {}) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) return { logs: [], total: 0, page, totalPages: 1 };

      try {
        let query = sb.from('nss_login_activity').select('*', { count: 'exact' });

        if (role && role !== 'all') {
          query = query.eq('role', role);
        }
        if (isRegistered !== 'all') {
          query = query.eq('is_registered', isRegistered === 'true');
        }
        if (search && search.trim()) {
          const q = search.trim();
          query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%,roll_number.ilike.%${q}%`);
        }

        const from = (page - 1) * limit;
        const to = from + limit - 1;
        query = query.order('login_at', { ascending: false }).range(from, to);

        const { data, count, error } = await query;
        if (error) throw error;

        return {
          logs: data || [],
          total: count || 0,
          page,
          totalPages: Math.ceil((count || 0) / limit) || 1
        };
      } catch (err) {
        console.error('Error fetching login activity:', err);
        return { logs: [], total: 0, page, totalPages: 1 };
      }
    }
  };

  // ==============================================================================
  // 5. ROLE INVITATIONS & PRESIDENT ACCESS (RBAC)
  // ==============================================================================
  NSS.RoleInvitations = {
    async listInvitations() {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) return [];
      try {
        const { data, error } = await sb
          .from('nss_role_invitations')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
      } catch (err) {
        console.error('Error listing invitations:', err);
        return [];
      }
    },

    async listActiveStaff() {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) return [];
      try {
        const { data, error } = await sb
          .from('nss_roles')
          .select('id, user_id, role, created_at');
        if (error) throw error;
        return data || [];
      } catch (err) {
        return [];
      }
    },

    async createInvitation({ email, name, role, metadata = {} }) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) throw new Error('Database client unavailable');
      const cleanEmail = email.trim().toLowerCase();
      const user = await NSS.Auth.getCurrentUser();

      const { data, error } = await sb
        .from('nss_role_invitations')
        .insert({
          email: cleanEmail,
          name: name ? name.trim() : null,
          role,
          status: 'pending',
          invited_by: user?.id || null,
          metadata
        })
        .select()
        .single();

      if (error) throw error;

      // Record audit log
      try {
        await sb.from('nss_audit_log').insert({
          action: 'role_invited',
          performed_by: user?.id || null,
          details: `Invited ${cleanEmail} as ${role.toUpperCase()}`
        });
      } catch (ignore) {}

      return data;
    },

    async revokeInvitation(invitationId) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) throw new Error('Database client unavailable');
      const { error } = await sb
        .from('nss_role_invitations')
        .update({ status: 'revoked' })
        .eq('id', invitationId);
      if (error) throw error;
      return true;
    },

    async revokeStaffRole(userId) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) throw new Error('Database client unavailable');
      const { error } = await sb
        .from('nss_roles')
        .delete()
        .eq('user_id', userId);
      if (error) throw error;
      return true;
    }
  };

  // ==============================================================================
  // 6. NSS ADMIN OPERATIONS (REAL DATABASE METRICS & LIFECYCLE)
  // ==============================================================================
  NSS.Admin = {
    /**
     * Loads live database statistics from Supabase without mock inflation
     */
    async loadLiveStats() {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      const stats = {
        totalApplications: 0,
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        revokedCount: 0,
        totalStudents: 0,
        totalDirectory: 0,
        totalGoogleUsers: 0,
        activeStaff: 0,
        registrationsByYear: { 'FY': 0, 'SY': 0, 'TY': 0, 'Fourth Year': 0 },
        registrationsByCourse: { 'B.Pharm': 0, 'M.Pharm': 0, 'D.Pharm': 0, 'Pharm.D': 0 }
      };

      if (!sb) return stats;

      try {
        // 1. Applications query
        const { data: apps } = await sb.from('nss_applications').select('id, status, course, academic_year');
        if (apps && apps.length) {
          stats.totalApplications = apps.length;
          apps.forEach(a => {
            if (a.status === 'pending') stats.pendingCount++;
            if (a.status === 'approved') stats.approvedCount++;
            if (a.status === 'rejected') stats.rejectedCount++;
            if (a.status === 'revoked') stats.revokedCount++;

            const yr = String(a.academic_year || '').toUpperCase().trim();
            if (yr.includes('FIRST') || yr === 'FY' || yr.includes('(FY)')) {
              stats.registrationsByYear['FY'] = (stats.registrationsByYear['FY'] || 0) + 1;
            } else if (yr.includes('SECOND') || yr === 'SY' || yr.includes('(SY)')) {
              stats.registrationsByYear['SY'] = (stats.registrationsByYear['SY'] || 0) + 1;
            } else if (yr.includes('THIRD') || yr === 'TY' || yr.includes('(TY)')) {
              stats.registrationsByYear['TY'] = (stats.registrationsByYear['TY'] || 0) + 1;
            } else if (yr.includes('FOUR') || yr.includes('FINAL') || yr.includes('(FINAL)')) {
              stats.registrationsByYear['Fourth Year'] = (stats.registrationsByYear['Fourth Year'] || 0) + 1;
            }

            const c = String(a.course || '').toUpperCase().trim();
            if (c.includes('B.PHARM') || c.includes('BACHELOR')) stats.registrationsByCourse['B.Pharm']++;
            else if (c.includes('M.PHARM') || c.includes('MASTER')) stats.registrationsByCourse['M.Pharm']++;
            else if (c.includes('D.PHARM') || c.includes('DIPLOMA')) stats.registrationsByCourse['D.Pharm']++;
            else if (c.includes('PHARM.D') || c.includes('DOCTOR')) stats.registrationsByCourse['Pharm.D']++;
          });
        }

        // 2. Directory count
        try {
          const { count: dirCount } = await sb.from('nss_volunteer_directory').select('*', { count: 'exact', head: true });
          stats.totalDirectory = dirCount || 0;
        } catch (e) {}

        // 3. Centralized students count (with fallback to total applications)
        try {
          const { count: studentCount, error: stErr } = await sb.from('nss_students').select('*', { count: 'exact', head: true });
          if (!stErr && typeof studentCount === 'number') {
            stats.totalStudents = studentCount;
          } else {
            stats.totalStudents = stats.totalApplications;
          }
        } catch (e) {
          stats.totalStudents = stats.totalApplications;
        }

        // 4. Login activity count
        try {
          const { count: loginCount, error: logErr } = await sb.from('nss_login_activity').select('*', { count: 'exact', head: true });
          if (!logErr && typeof loginCount === 'number') {
            stats.totalGoogleUsers = loginCount;
          } else {
            stats.totalGoogleUsers = 0;
          }
        } catch (e) {
          stats.totalGoogleUsers = 0;
        }

        // 5. Staff roles count
        try {
          const { count: roleCount } = await sb.from('nss_roles').select('*', { count: 'exact', head: true });
          stats.activeStaff = roleCount || 0;
        } catch (e) {}

      } catch (err) {
        console.warn('Error computing live stats:', err);
      }

      stats.pendingApplications = stats.pendingCount;
      stats.approvedVolunteers = stats.approvedCount;
      stats.rejectedApplications = stats.rejectedCount;
      stats.directoryRecords = stats.totalDirectory;
      stats.coordinatorsCount = stats.activeStaff;
      stats.recentLogins = stats.totalGoogleUsers;
      stats.yearBreakdown = {
        FY: stats.registrationsByYear['FY'] || 0,
        SY: stats.registrationsByYear['SY'] || 0,
        TY: stats.registrationsByYear['TY'] || 0,
        Final: stats.registrationsByYear['Fourth Year'] || 0
      };

      return stats;
    },

    // Backward-compatible alias for existing callers
    async loadStats() {
      const live = await this.loadLiveStats();
      return {
        total: live.totalApplications,
        pending: live.pendingCount,
        approved: live.approvedCount,
        rejected: live.rejectedCount,
        revoked: live.revokedCount,
        ...live
      };
    },

    async loadPending() {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) return [];
      try {
        const { data, error } = await sb
          .from('nss_applications')
          .select('*')
          .eq('status', 'pending')
          .order('submitted_at', { ascending: true });
        if (error) throw error;
        return data || [];
      } catch (e) {
        console.error('Error loading pending:', e);
        return [];
      }
    },

    async loadAll(statusFilter = 'all', searchQuery = '') {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) return [];
      try {
        let query = sb.from('nss_applications').select('*').order('submitted_at', { ascending: false });
        if (statusFilter && statusFilter !== 'all') {
          query = query.eq('status', statusFilter);
        }
        if (searchQuery && searchQuery.trim()) {
          const q = searchQuery.trim();
          query = query.or(`full_name.ilike.%${q}%,roll_number.ilike.%${q}%,ref_code.ilike.%${q}%,volunteer_id.ilike.%${q}%,college_email.ilike.%${q}%`);
        }
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      } catch (e) {
        console.error('Error loading all applications:', e);
        return [];
      }
    },

    async approveApp(appId) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) throw new Error('Supabase client unavailable');
      const { data, error } = await sb.rpc('nss_approve_volunteer', { app_id: appId });
      if (error) throw error;

      // Update student table record
      try {
        await sb.from('nss_students').update({
          application_status: 'approved',
          volunteer_id: data.volunteer_id,
          approval_date: new Date().toISOString()
        }).eq('registration_id', appId);
      } catch (ignore) {}

      // AUTOMATIC NOTIFICATION TRIGGER: Send Approval Email (via Brevo) & SMS
      let notificationResult = null;
      try {
        notificationResult = await this.sendApprovalNotification(appId, { forceRetry: false });
      } catch (notifErr) {
        console.warn('[Automatic Approval Notification Notice]:', notifErr.message);
      }

      return {
        ...data,
        notification: notificationResult
      };
    },

    async sendApprovalNotification(appId, { forceRetry = false, appData = null } = {}) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      let token = null;
      if (sb) {
        try {
          const { data: { session } } = await sb.auth.getSession();
          if (session && session.access_token) token = session.access_token;
        } catch (ignore) {}
      }

      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      const res = await fetch('/api/send-approval-notification', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          applicationId: appId,
          forceRetry,
          applicationData: appData
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to dispatch approval notification');
      }
      return data;
    },

    async loadNotificationLogs(appId = null) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) return [];
      try {
        let q = sb.from('nss_notification_logs').select('*').order('created_at', { ascending: false });
        if (appId) q = q.eq('application_id', appId);
        const { data, error } = await q.limit(50);
        if (error) throw error;
        return data || [];
      } catch (e) {
        console.warn('Could not fetch notification logs:', e);
        return [];
      }
    },

    async rejectApp(appId, reason = '') {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) throw new Error('Supabase client unavailable');
      const { data, error } = await sb.rpc('nss_reject_volunteer', { app_id: appId, reason });
      if (error) throw error;

      try {
        await sb.from('nss_students').update({
          application_status: 'rejected'
        }).eq('registration_id', appId);
      } catch (ignore) {}

      return data;
    },

    async revokeCard(appId, reason = '') {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) throw new Error('Supabase client unavailable');
      const { data, error } = await sb.rpc('nss_revoke_card', { app_id: appId, reason });
      if (error) throw error;

      try {
        await sb.from('nss_students').update({
          application_status: 'revoked'
        }).eq('registration_id', appId);
      } catch (ignore) {}

      return data;
    },

    async loadLeadership() {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) return [];
      try {
        const { data, error } = await sb
          .from('nss_leadership')
          .select('*')
          .order('display_order', { ascending: true });
        if (error) throw error;
        return data || [];
      } catch (err) {
        return [];
      }
    },

    async saveLeadership(profile) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) throw new Error('Supabase unavailable');
      const { data, error } = await sb
        .from('nss_leadership')
        .upsert(profile)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    async deleteLeadership(id) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (!sb) throw new Error('Supabase unavailable');
      const { error } = await sb.from('nss_leadership').delete().eq('id', id);
      if (error) throw error;
      return true;
    },

    exportApprovedCSV() {
      NSS.Admin.loadAll('approved').then(list => {
        if (!list || !list.length) {
          alert('No approved volunteers available to export.');
          return;
        }
        const headers = ['Volunteer ID', 'Ref Code', 'Full Name', 'Roll Number', 'PRN', 'Course', 'Year', 'Division', 'College Email', 'Mobile', 'Approved Date'];
        const rows = list.map(a => [
          `"${a.volunteer_id || ''}"`,
          `"${a.ref_code || ''}"`,
          `"${(a.full_name || '').replace(/"/g, '""')}"`,
          `"${a.roll_number || ''}"`,
          `"${a.prn || ''}"`,
          `"${a.course || ''}"`,
          `"${a.academic_year || ''}"`,
          `"${a.division || ''}"`,
          `"${a.college_email || ''}"`,
          `"${a.mobile || ''}"`,
          `"${a.reviewed_at ? new Date(a.reviewed_at).toLocaleDateString('en-IN') : ''}"`
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `NSS_TGPCOP_Approved_Volunteers_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
    }
  };

  // ==============================================================================
  // 7. VOLUNTEER DIRECTORY API (nss_volunteer_directory)
  // ==============================================================================
  NSS.Directory = {
    _getLocalStore() {
      try {
        const stored = localStorage.getItem('nss_volunteer_directory_cache');
        if (stored) return JSON.parse(stored);
      } catch (e) {}
      return (window.NSS_DIRECTORY_SEED && Array.isArray(window.NSS_DIRECTORY_SEED))
        ? window.NSS_DIRECTORY_SEED
        : [];
    },

    _saveLocalStore(data) {
      try {
        localStorage.setItem('nss_volunteer_directory_cache', JSON.stringify(data));
      } catch (e) {}
    },

    async loadDirectory({ page = 1, limit = 20, search = '', filter = 'all', batch = 'all' } = {}) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      let records = [];
      let totalCount = 0;

      if (sb) {
        try {
          let query = sb.from('nss_volunteer_directory').select('*', { count: 'exact' });
          if (filter === 'with_email') query = query.eq('email_status', 'added');
          else if (filter === 'pending_email') query = query.eq('email_status', 'pending');

          if (batch && batch !== 'all') {
            query = query.eq('import_batch_id', batch);
          }
          if (search && search.trim()) {
            const q = search.trim();
            query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`);
          }

          const from = (page - 1) * limit;
          const to = from + limit - 1;
          query = query.order('source_row_number', { ascending: true, nullsFirst: false }).range(from, to);

          const { data, count, error } = await query;
          if (!error && data && data.length > 0) {
            records = data;
            totalCount = count || records.length;
            this._saveLocalStore(records);
          }
        } catch (e) {
          console.warn('Supabase directory fetch failed, falling back to local seed:', e);
        }
      }

      // Fallback to local store if DB unavailable or empty
      if (!records.length) {
        let allLocal = this._getLocalStore();
        if (filter === 'with_email') allLocal = allLocal.filter(r => r.email_status === 'added' || (r.email && r.email.includes('@')));
        else if (filter === 'pending_email') allLocal = allLocal.filter(r => r.email_status === 'pending' || !r.email);

        if (batch && batch !== 'all') {
          allLocal = allLocal.filter(r => r.import_batch_id === batch);
        }
        if (search && search.trim()) {
          const q = search.trim().toLowerCase();
          allLocal = allLocal.filter(r =>
            (r.full_name && r.full_name.toLowerCase().includes(q)) ||
            (r.email && r.email.toLowerCase().includes(q))
          );
        }

        totalCount = allLocal.length;
        const from = (page - 1) * limit;
        records = allLocal.slice(from, from + limit);
      }

      // Compute stats
      const allForStats = this._getLocalStore();
      const withEmail = allForStats.filter(r => r.email_status === 'added' || (r.email && r.email.includes('@'))).length;
      const batches = [...new Set(allForStats.map(r => r.import_batch_id).filter(Boolean))];

      return {
        records,
        total: totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit) || 1,
        batchList: batches,
        stats: {
          total: allForStats.length,
          withEmail,
          pendingEmail: Math.max(0, allForStats.length - withEmail)
        }
      };
    },

    async importNames(namesList, batchId = null) {
      if (!Array.isArray(namesList) || namesList.length === 0) {
        throw new Error('No valid volunteer names to import.');
      }

      const cleanBatchId = batchId || ('BATCH-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.random().toString(36).substr(2, 4).toUpperCase());

      // STRICT PRIVACY: Extract ONLY full_name and source_row_number
      const recordsToInsert = namesList.map((item, idx) => ({
        full_name: typeof item === 'string' ? item.trim() : (item.name || item.full_name || '').trim(),
        email: null,
        email_status: 'pending',
        import_batch_id: cleanBatchId,
        source_row_number: typeof item === 'object' && item.row ? item.row : (idx + 1),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })).filter(r => r.full_name.length > 0);

      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (sb) {
        try {
          const dbRows = recordsToInsert.map(r => ({
            full_name: r.full_name,
            email: r.email,
            email_status: r.email_status,
            import_batch_id: r.import_batch_id,
            source_row_number: r.source_row_number,
            created_at: r.created_at,
            updated_at: r.updated_at
          }));
          const { data, error } = await sb
            .from('nss_volunteer_directory')
            .insert(dbRows)
            .select();
          if (error) {
            console.warn('Supabase directory upsert warning:', error);
          } else if (data && data.length > 0) {
            data.forEach(dbRow => {
              const match = recordsToInsert.find(r => r.source_row_number === dbRow.source_row_number);
              if (match) match.id = dbRow.id;
            });
          }
        } catch (e) {
          console.warn('Supabase directory upsert failed, saving to local store:', e);
        }
      }

      // Ensure each item has an id for local interaction
      recordsToInsert.forEach((r, i) => {
        if (!r.id) r.id = 'dir-' + cleanBatchId + '-' + (r.source_row_number || i + 1);
      });

      // Sync local cache
      const current = this._getLocalStore();
      const merged = [...recordsToInsert, ...current.filter(c => c.import_batch_id !== cleanBatchId)];
      this._saveLocalStore(merged);

      return {
        success: true,
        count: recordsToInsert.length,
        batchId: cleanBatchId
      };
    },

    async saveEmail(recordId, newEmail) {
      const email = String(newEmail || '').trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!email || !emailRegex.test(email)) {
        throw new Error('Please provide a valid email address.');
      }

      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (sb) {
        try {
          await sb
            .from('nss_volunteer_directory')
            .update({ email, email_status: 'added', updated_at: new Date().toISOString() })
            .eq('id', recordId);
        } catch (e) {
          console.warn('DB saveEmail failed:', e);
        }
      }

      const local = this._getLocalStore();
      const item = local.find(r => r.id === recordId);
      if (item) {
        item.email = email;
        item.email_status = 'added';
        item.updated_at = new Date().toISOString();
        this._saveLocalStore(local);
      }

      return { success: true, email };
    },

    async removeEmail(recordId) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (sb) {
        try {
          await sb
            .from('nss_volunteer_directory')
            .update({ email: null, email_status: 'pending', updated_at: new Date().toISOString() })
            .eq('id', recordId);
        } catch (e) {}
      }

      const local = this._getLocalStore();
      const item = local.find(r => r.id === recordId);
      if (item) {
        item.email = null;
        item.email_status = 'pending';
        item.updated_at = new Date().toISOString();
        this._saveLocalStore(local);
      }

      return { success: true };
    },

    exportCSV() {
      const local = this._getLocalStore();
      if (!local || !local.length) {
        alert('Directory is empty.');
        return;
      }
      const headers = ['Sr No', 'Volunteer Name', 'Email Address', 'Email Status', 'Import Batch', 'Source Row'];
      const rows = local.map((r, i) => [
        i + 1,
        `"${(r.full_name || '').replace(/"/g, '""')}"`,
        `"${r.email || ''}"`,
        `"${r.email_status || 'pending'}"`,
        `"${r.import_batch_id || ''}"`,
        r.source_row_number || ''
      ]);
      const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `NSS_Volunteer_Directory_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // ==============================================================================
  // 8. EMAIL ACTIVITY LOGS (nss_email_logs)
  // ==============================================================================
  NSS.EmailLogs = {
    async getLogs(limit = 30) {
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (sb) {
        try {
          const { data, error } = await sb
            .from('nss_email_logs')
            .select('*')
            .order('sent_at', { ascending: false })
            .limit(limit);
          if (!error && data) return data;
        } catch (e) {}
      }

      try {
        const stored = localStorage.getItem('nss_email_logs_cache');
        if (stored) return JSON.parse(stored).slice(0, limit);
      } catch (e) {}
      return [];
    },

    async saveLogs(records = []) {
      if (!records || !records.length) return;
      const sb = (typeof window !== 'undefined' && window.NSS && typeof window.NSS.getSupabase === 'function')
        ? await window.NSS.getSupabase()
        : (typeof NSS !== 'undefined' && typeof NSS.getSupabase === 'function' ? await NSS.getSupabase() : null);
      if (sb) {
        try {
          await sb.from('nss_email_logs').insert(records);
        } catch (e) {}
      }

      try {
        const current = JSON.parse(localStorage.getItem('nss_email_logs_cache') || '[]');
        const updated = [...records, ...current].slice(0, 100);
        localStorage.setItem('nss_email_logs_cache', JSON.stringify(updated));
      } catch (e) {}
    }
  };

  // ==============================================================================
  // 9. QR SCANNER & PUBLIC VERIFICATION
  // ==============================================================================
  NSS.QRVerify = async function (token) {
    const sb = await NSS.getSupabase();
    if (!sb) return { result: 'invalid', message: 'Verification client unavailable' };
    try {
      const { data, error } = await sb.rpc('nss_verify_token', { p_token: token.trim() });
      if (error) throw error;
      return data;
    } catch (err) {
      console.error('Error verifying token:', err);
      return { result: 'invalid', message: err.message || 'Verification failed' };
    }
  };

  NSS.verifyByVolunteerId = async function (volunteerId) {
    const sb = await NSS.getSupabase();
    if (!sb) return null;
    try {
      const cleanId = volunteerId.trim().toUpperCase();
      const { data, error } = await sb
        .from('nss_applications')
        .select('*')
        .eq('volunteer_id', cleanId)
        .maybeSingle();

      if (error || !data) return null;

      return {
        result: data.status,
        name: data.full_name,
        volunteer_id: data.volunteer_id,
        course: data.course,
        academic_year: data.academic_year,
        photo_url: data.status === 'approved' ? data.photo_url : null,
        issued_at: data.reviewed_at
      };
    } catch (err) {
      console.error('Lookup by ID failed:', err);
      return null;
    }
  };

  NSS.QRScanner = {
    stream: null,
    animationFrameId: null,
    isScanning: false,

    async start(videoElement, onDetected, onError) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (typeof onError === 'function') onError(new Error('Camera API unavailable.'));
        return;
      }

      try {
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
            if (window.jsQR) {
              const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
              });
              if (code && code.data) {
                this.stop();
                if (typeof onDetected === 'function') onDetected(code.data);
                return;
              }
            }
          }
          this.animationFrameId = requestAnimationFrame(scanLoop);
        };

        this.animationFrameId = requestAnimationFrame(scanLoop);
      } catch (err) {
        console.error('Camera start error:', err);
        if (typeof onError === 'function') onError(err);
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

  // Nav Enhancement
  NSS.initNav = async function () {
    try {
      const user = await NSS.Auth.getCurrentUser();
      const btn = document.querySelector('.nss-subnav-btn');
      const links = document.querySelector('.nss-subnav-links');
      if (user && links) {
        const role = await NSS.Auth.getUserRole(user.id);
        const isStaff = ['super_admin', 'coordinator', 'president'].includes(role);
        if (btn) {
          if (isStaff) {
            btn.textContent = 'Admin Desk';
            btn.href = 'admin.html';
          } else {
            btn.textContent = 'My Status';
            btn.href = 'status.html';
          }
        }
      }
    } catch (e) {}
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { setTimeout(NSS.initNav, 300); });
    } else {
      setTimeout(NSS.initNav, 300);
    }
  }

  if (typeof window !== "undefined") window.NSS = NSS;
  if (typeof globalThis !== "undefined") globalThis.NSS = NSS;

})(typeof window !== 'undefined' ? window : this);
