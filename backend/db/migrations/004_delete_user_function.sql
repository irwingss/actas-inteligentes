-- ============================================
-- MIGRACIÓN: Función para eliminar usuarios
-- Fecha: 2025-01-17
-- Descripción: Permite a superadmins eliminar cuentas de usuario de forma segura
-- ============================================

-- Función para eliminar un usuario completamente
CREATE OR REPLACE FUNCTION delete_user_account(
  p_target_user_id UUID,
  p_deleted_by UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_target_profile RECORD;
  v_deleting_profile RECORD;
  v_superadmin_count INTEGER;
BEGIN
  -- 1. Verificar que el usuario que ejecuta es superadmin
  SELECT role INTO v_deleting_profile
  FROM profiles
  WHERE id = p_deleted_by;
  
  IF v_deleting_profile.role != 'superadmin' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Solo superadmins pueden eliminar usuarios'
    );
  END IF;
  
  -- 2. Obtener información del usuario objetivo
  SELECT * INTO v_target_profile
  FROM profiles
  WHERE id = p_target_user_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Usuario no encontrado'
    );
  END IF;
  
  -- 3. Validar que el usuario esté desactivado
  IF v_target_profile.is_active = true THEN
    RETURN json_build_object(
      'success', false,
      'error', 'El usuario debe estar desactivado antes de eliminarlo'
    );
  END IF;
  
  -- 4. Prevenir auto-eliminación
  IF p_target_user_id = p_deleted_by THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No puedes eliminar tu propia cuenta'
    );
  END IF;
  
  -- 5. Si es superadmin, verificar que no sea el último
  IF v_target_profile.role = 'superadmin' THEN
    SELECT COUNT(*) INTO v_superadmin_count
    FROM profiles
    WHERE role = 'superadmin' AND is_active = true;
    
    IF v_superadmin_count <= 1 THEN
      RETURN json_build_object(
        'success', false,
        'error', 'No se puede eliminar el último superadmin activo del sistema'
      );
    END IF;
  END IF;
  
  -- 6. Registrar en audit log antes de eliminar
  INSERT INTO admin_audit_log (
    admin_id,
    action,
    target_user_id,
    details
  ) VALUES (
    p_deleted_by,
    'delete_user',
    p_target_user_id,
    json_build_object(
      'deleted_email', v_target_profile.email,
      'deleted_role', v_target_profile.role,
      'deleted_name', v_target_profile.full_name
    )
  );
  
  -- 7. Eliminar permisos de CA del usuario
  DELETE FROM user_ca_permissions
  WHERE user_id = p_target_user_id;
  
  -- 8. Eliminar el perfil del usuario
  DELETE FROM profiles
  WHERE id = p_target_user_id;
  
  -- 9. Eliminar el usuario de auth.users (Supabase Auth)
  -- Nota: Esto requiere que la función tenga permisos sobre auth.users
  DELETE FROM auth.users
  WHERE id = p_target_user_id;
  
  -- 10. Retornar éxito
  RETURN json_build_object(
    'success', true,
    'deleted_email', v_target_profile.email,
    'deleted_role', v_target_profile.role
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN json_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- Comentario de la función
COMMENT ON FUNCTION delete_user_account IS 
'Elimina completamente una cuenta de usuario. Requiere que el usuario esté desactivado y que el ejecutor sea superadmin.';
