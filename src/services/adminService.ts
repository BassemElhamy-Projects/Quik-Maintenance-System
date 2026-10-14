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
    const { data, error } = await supabase.functions.invoke('init-first-admin', {
      body: { username, password, fullName, phone }
    });

    if (error) {
      let extractedMsg = error.message;
      try {
        if ((error as any).context && typeof (error as any).context.json === 'function') {
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
      message: data?.message || 'تم إنشاء حساب مدير النظام الأول بنجاح.'
    };
  } catch (err: any) {
    return {
      success: false,
      error: 'حدث خطأ غير متوقع أثناء الاتصال بالخادم: ' + (err?.message || String(err))
    };
  }
}

/**
 * Calls the secure Supabase Edge Function 'admin-reset-password'
 * to reset another user's password without exposing elevated keys to the client.
 * Server-side authorization ensures only active Admins can perform this action.
 */
export async function resetUserPasswordByAdmin(
  userId: string,
  newPassword: string
): Promise<AdminResetPasswordResult> {
  if (!supabase) {
    return { success: false, error: 'خدمة السحابة غير مهيأة.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('admin-reset-password', {
      body: { userId, newPassword }
    });

    if (error) {
      let extractedMsg = error.message;
      try {
        if ((error as any).context && typeof (error as any).context.json === 'function') {
          const body = await (error as any).context.json();
          if (body?.error) extractedMsg = body.error;
        }
      } catch {}

      if (!extractedMsg || extractedMsg.includes('Failed to send') || extractedMsg.includes('Functions') || extractedMsg.includes('Edge Function') || extractedMsg.includes('404')) {
        extractedMsg = 'تعذر الاتصال بالخدمة السحابية لإعادة تعيين كلمة المرور.';
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
  } catch (err: any) {
    return {
      success: false,
      error: 'تعذر إتمام العملية بسبب انقطاع الاتصال بالخدمة السحابية.'
    };
  }
}

/**
 * Calls the secure Supabase Edge Function 'admin-create-user'
 * to create a new user account on the server using service role permissions.
 */
export async function addNewUserByAdmin(
  username: string,
  password: string,
  fullName: string,
  role: 'admin' | 'user',
  phone?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'خدمة السحابة غير مهيأة.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: { username, password, fullName, role, phone }
    });

    if (error) {
      let extractedMsg = error.message;
      try {
        if ((error as any).context && typeof (error as any).context.json === 'function') {
          const body = await (error as any).context.json();
          if (body?.error) extractedMsg = body.error;
        }
      } catch {}

      if (!extractedMsg || extractedMsg.includes('Failed to send') || extractedMsg.includes('Functions') || extractedMsg.includes('Edge Function') || extractedMsg.includes('404')) {
        extractedMsg = 'تعذر الاتصال بالخدمة السحابية لإضافة المستخدم.';
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
  } catch (err: any) {
    return {
      success: false,
      error: 'تعذر إتمام العملية بسبب انقطاع الاتصال بالخدمة السحابية.'
    };
  }
}
