import { supabase } from './supabaseClient';

export interface AdminResetPasswordResult {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * Calls the secure Supabase Edge Function 'init-first-admin'
 * to initialize the first admin account on the server.
 */
export async function initializeFirstAdminServer(
  username: string,
  password: string,
  fullName: string,
  phone?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'خدمة السحابة غير مهيأة.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      'init-first-admin',
      {
        body: { username, password, fullName, phone }
      }
    );

    if (error) {
      let extractedMsg = error.message;

      try {
        if (
          (error as any).context &&
          typeof (error as any).context.json === 'function'
        ) {
          const body = await (error as any).context.json();
          if (body?.error) extractedMsg = body.error;
        }
      } catch {}

      const isDeployOrNetworkError =
        extractedMsg?.includes('Failed to send a request') ||
        extractedMsg?.includes('FunctionsFetchError') ||
        extractedMsg?.includes('404');

      const detailedMsg = isDeployOrNetworkError
        ? 'تعذر الاتصال بالخدمة السحابية لتهيئة المدير الأول. يرجى إعادة المحاولة.'
        : extractedMsg || 'تعذر استدعاء خدمة تهيئة المدير الأول.';

      return {
        success: false,
        error: detailedMsg
      };
    }

    if (data?.error) {
      return {
        success: false,
        error: data.error
      };
    }

    return {
      success: true,
      message:
        data?.message || 'تم إنشاء حساب مدير النظام الأول بنجاح.'
    };
  } catch (err: any) {
    return {
      success: false,
      error:
        'حدث خطأ غير متوقع أثناء الاتصال بالخادم: ' +
        (err?.message || String(err))
    };
  }
}

/**
 * Calls the secure Supabase Edge Function 'admin-reset-password'
 * to reset another user's password without exposing elevated keys.
 * Server-side authorization must ensure only active Admins can do this.
 */
export async function resetUserPasswordByAdmin(
  userId: string,
  newPassword: string
): Promise<AdminResetPasswordResult> {
  if (!supabase) {
    return {
      success: false,
      error: 'خدمة السحابة غير مهيأة.'
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      'admin-reset-password',
      {
        body: { userId, newPassword }
      }
    );

    if (error) {
      let extractedMsg = error.message;

      try {
        if (
          (error as any).context &&
          typeof (error as any).context.json === 'function'
        ) {
          const body = await (error as any).context.json();
          if (body?.error) extractedMsg = body.error;
        }
      } catch {}

      if (
        !extractedMsg ||
        extractedMsg.includes('Failed to send') ||
        extractedMsg.includes('Functions') ||
        extractedMsg.includes('Edge Function') ||
        extractedMsg.includes('404')
      ) {
        extractedMsg =
          'تعذر الاتصال بالخدمة السحابية لإعادة تعيين كلمة المرور.';
      }

      return {
        success: false,
        error: extractedMsg
      };
    }

    if (data?.error) {
      return {
        success: false,
        error: data.error
      };
    }

    return {
      success: true,
      message: data?.message || 'تم إعادة تعيين كلمة المرور بنجاح.'
    };
  } catch {
    return {
      success: false,
      error:
        'تعذر إتمام العملية بسبب انقطاع الاتصال بالخدمة السحابية.'
    };
  }
}

/**
 * Calls the secure Supabase Edge Function 'admin-create-user'.
 * Refreshes an expiring session and explicitly forwards the access token.
 */
export async function addNewUserByAdmin(
  username: string,
  password: string,
  fullName: string,
  role: 'admin' | 'user',
  phone?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!supabase) {
    return {
      success: false,
      error: 'خدمة السحابة غير مهيأة.'
    };
  }

  try {
    // Read the current authenticated session.
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) {
      return {
        success: false,
        error:
          'تعذر التحقق من جلسة الدخول. سجّل الخروج ثم ادخل مرة أخرى.'
      };
    }

    let session = sessionData.session;

    // Refresh the session if it is missing an expiry timestamp
    // or is due to expire within the next 60 seconds.
    if (session) {
      const expiresAt = session.expires_at ?? 0;
      const expiresSoon =
        !expiresAt || expiresAt * 1000 <= Date.now() + 60_000;

      if (expiresSoon) {
        const { data: refreshedData, error: refreshError } =
          await supabase.auth.refreshSession();

        if (refreshError || !refreshedData.session) {
          return {
            success: false,
            error:
              'انتهت صلاحية جلسة الدخول. سجّل الخروج ثم ادخل مرة أخرى.'
          };
        }

        session = refreshedData.session;
      }
    }

    // Never invoke the function without a valid local access token.
    if (!session?.access_token) {
      return {
        success: false,
        error:
          'جلسة الدخول غير موجودة أو انتهت صلاحيتها. سجّل الدخول مرة أخرى.'
      };
    }

    // Explicitly forward the current access token to the Edge Function.
    const { data, error } = await supabase.functions.invoke(
      'admin-create-user',
      {
        body: { username, password, fullName, role, phone },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      }
    );

    if (error) {
      let extractedMsg = error.message;

      try {
        if (
          (error as any).context &&
          typeof (error as any).context.json === 'function'
        ) {
          const body = await (error as any).context.json();
          if (body?.error) extractedMsg = body.error;
        }
      } catch {}

      if (extractedMsg?.includes('جلسة المستخدم غير صالحة')) {
        extractedMsg =
          'رفضت الخدمة السحابية جلسة الدخول. سجّل الخروج ثم ادخل مرة أخرى، وإذا استمرت المشكلة فراجع إعدادات Supabase Auth.';
      } else if (
        !extractedMsg ||
        extractedMsg.includes('Failed to send') ||
        extractedMsg.includes('Functions') ||
        extractedMsg.includes('Edge Function') ||
        extractedMsg.includes('404')
      ) {
        extractedMsg =
          'تعذر الاتصال بالخدمة السحابية لإضافة المستخدم.';
      }

      return {
        success: false,
        error: extractedMsg
      };
    }

    if (data?.error) {
      return {
        success: false,
        error: data.error
      };
    }

    return {
      success: true,
      message: data?.message || 'تم إضافة المستخدم بنجاح.'
    };
  } catch {
    return {
      success: false,
      error:
        'تعذر إتمام العملية بسبب انقطاع الاتصال بالخدمة السحابية.'
    };
  }
}