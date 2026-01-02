import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useDarkMode';
import api from '../lib/axios';
import {
  Settings,
  Save,
  RefreshCw,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Loader2,
  Link as LinkIcon,
  FileCode,
  Camera,
  AlertTriangle,
  Info,
  Sun,
  Moon,
  Sparkles,
  Eye,
  EyeOff,
  Copy,
  Check
} from 'lucide-react';
import { INTERNAL_FIELDS_METADATA } from '../hooks/useFieldMapping';
import { ThemeToggle } from '../components/ThemeToggle';

export default function ConfigurationPage() {
  const navigate = useNavigate();
  const { user, profile, isSuperAdmin, loading: authLoading } = useAuth();
  const [theme, cycleTheme] = useTheme();

  // Estados
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState(null);

  // Estados para edición de URL
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [originalUrl, setOriginalUrl] = useState('');
  const [showFullUrl, setShowFullUrl] = useState(false);

  // Configuración
  const [survey123Url, setSurvey123Url] = useState('');
  const [survey123Layer1Url, setSurvey123Layer1Url] = useState('');
  const [survey123Layer2Url, setSurvey123Layer2Url] = useState('');
  const [fieldMappings, setFieldMappings] = useState({});
  const [photoConfig, setPhotoConfig] = useState({
    table_name: 'Fotos',
    relationship_field: 'rel_globalid',
    filename_field: 'nombre_foto'
  });

  // Datos de sincronización
  const [syncData, setSyncData] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);

  // Configuración de IA
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiModel, setGeminiModel] = useState('gemini-2.5-flash');
  const [geminiModelExpert, setGeminiModelExpert] = useState('gemini-3-pro-preview');
  const [showApiKey, setShowApiKey] = useState(false);
  const [savingAI, setSavingAI] = useState(false);
  const [aiConfigLoaded, setAiConfigLoaded] = useState(false);

  // Configuración del encabezado del Acta
  const [actaDecenio, setActaDecenio] = useState('«Decenio de la Igualdad de Oportunidades para Mujeres y Hombres»');
  const [actaAnio, setActaAnio] = useState('«Año de la Recuperación y Consolidación de la Economía Peruana»');
  const [savingActaHeader, setSavingActaHeader] = useState(false);

  // Verificar permisos - esperar a que termine de cargar antes de redirigir
  useEffect(() => {
    if (!authLoading && !isSuperAdmin) {
      navigate('/');
    }
  }, [authLoading, isSuperAdmin, navigate]);

  // Cargar configuración actual - solo si es superadmin
  useEffect(() => {
    if (!authLoading && isSuperAdmin) {
      fetchConfiguration();
      fetchAIConfiguration();
    }
  }, [authLoading, isSuperAdmin]);

  // Cargar configuración de IA
  const fetchAIConfiguration = async () => {
    try {
      const response = await api.get('/api/ai-config/full');
      if (response.data?.config) {
        setGeminiApiKey(response.data.config.gemini_api_key || '');
        setGeminiModel(response.data.config.gemini_model || 'gemini-2.5-flash');
        setGeminiModelExpert(response.data.config.gemini_model_expert || 'gemini-3-pro-preview');
        setAiConfigLoaded(true);
      }
    } catch (error) {
      console.error('Error al cargar configuración AI:', error);
    }
  };

  // Guardar configuración de IA
  const handleSaveAIConfig = async () => {
    try {
      setSavingAI(true);
      await api.put('/api/ai-config', {
        gemini_api_key: geminiApiKey,
        gemini_model: geminiModel,
        gemini_model_expert: geminiModelExpert
      });
      showMessage('success', 'Configuración de IA guardada correctamente');
      
      // Sincronizar al backend local
      await api.post('/api/ai-config/sync');
    } catch (error) {
      console.error('Error al guardar configuración AI:', error);
      showMessage('error', 'Error al guardar la configuración de IA');
    } finally {
      setSavingAI(false);
    }
  };

  const fetchConfiguration = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/configuration');

      if (response.data) {
        const url = response.data.survey123_url || '';
        setSurvey123Url(url);
        setSurvey123Layer1Url(response.data.survey123_layer1_url || '');
        setSurvey123Layer2Url(response.data.survey123_layer2_url || '');
        setOriginalUrl(url); // Guardar URL original
        setFieldMappings(response.data.field_mappings || {});
        setPhotoConfig(response.data.photo_attachment_config || photoConfig);
        setLastSyncAt(response.data.last_sync_at);
        
        // Cargar configuración del encabezado del acta
        setActaDecenio(response.data.acta_decenio || '«Decenio de la Igualdad de Oportunidades para Mujeres y Hombres»');
        setActaAnio(response.data.acta_anio || '«Año de la Recuperación y Consolidación de la Economía Peruana»');
      }
    } catch (error) {
      console.error('Error al cargar configuración:', error);
      showMessage('error', 'Error al cargar la configuración');
    } finally {
      setLoading(false);
      setIsEditingUrl(false); // Resetear modo de edición
    }
  };

  const handleSync = async () => {
    if (!survey123Url.trim()) {
      showMessage('error', 'Debe ingresar una URL de Survey123 válida');
      return;
    }

    try {
      setSyncing(true);
      setMessage(null);

      const response = await api.post('/api/configuration/sync', {
        survey123_url: survey123Url
      });

      if (response.data.success) {
        setSyncData(response.data);
        showMessage('success', `✓ Sincronización exitosa: ${response.data.totalColumns} columnas encontradas`);

        // Auto-guardar columnas sincronizadas
        await saveConfiguration({ last_sync_columns: response.data.columns });
      }
    } catch (error) {
      console.error('Error al sincronizar:', error);
      showMessage('error', error.response?.data?.error || 'Error al sincronizar con Survey123');
    } finally {
      setSyncing(false);
    }
  };

  const saveConfiguration = async (overrides = {}) => {
    try {
      setSaving(true);

      const payload = {
        survey123_url: survey123Url,
        survey123_layer1_url: survey123Layer1Url,
        survey123_layer2_url: survey123Layer2Url,
        field_mappings: fieldMappings,
        photo_attachment_config: photoConfig,
        ...overrides
      };

      const response = await api.post('/api/configuration', payload);

      if (response.data.success) {
        showMessage('success', '✓ Configuración guardada correctamente');

        // Recargar para obtener última actualización
        await fetchConfiguration();
      }
    } catch (error) {
      console.error('Error al guardar:', error);
      showMessage('error', error.response?.data?.error || 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    saveConfiguration();
  };

  // Limpiar mapeos huérfanos (campos que ya no están en INTERNAL_FIELDS_METADATA)
  const cleanOrphanedMappings = () => {
    const validFields = Object.keys(INTERNAL_FIELDS_METADATA);
    const cleanedMappings = {};

    Object.entries(fieldMappings).forEach(([key, value]) => {
      if (validFields.includes(key)) {
        cleanedMappings[key] = value;
      }
    });

    setFieldMappings(cleanedMappings);
    showMessage('success', '✓ Mapeos huérfanos eliminados');
  };

  const handleMappingChange = (internalField, survey123Column) => {
    setFieldMappings(prev => ({
      ...prev,
      [internalField]: survey123Column
    }));
  };

  const handlePhotoConfigChange = (field, value) => {
    setPhotoConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Guardar configuración del encabezado del acta
  const handleSaveActaHeader = async () => {
    try {
      setSavingActaHeader(true);
      
      const response = await api.post('/api/configuration', {
        acta_decenio: actaDecenio,
        acta_anio: actaAnio
      });

      if (response.data.success) {
        showMessage('success', '✓ Configuración del encabezado guardada correctamente');
      }
    } catch (error) {
      console.error('Error al guardar encabezado del acta:', error);
      showMessage('error', error.response?.data?.error || 'Error al guardar configuración del encabezado');
    } finally {
      setSavingActaHeader(false);
    }
  };

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Funciones para manejo de URL
  const truncateUrl = (url) => {
    if (!url || url.length <= 50) return url;
    const start = url.substring(0, 30);
    const end = url.substring(url.length - 15);
    return `${start}...${end}`;
  };

  const [urlCopied, setUrlCopied] = useState(false);

  const copyUrlToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(survey123Url);
      setUrlCopied(true);
      setTimeout(() => setUrlCopied(false), 2000);
    } catch (error) {
      console.error('Error al copiar URL:', error);
      showMessage('error', 'No se pudo copiar la URL');
    }
  };

  // Funciones para manejo de edición de URL
  const handleStartEditUrl = () => {
    setOriginalUrl(survey123Url);
    setIsEditingUrl(true);
    setShowFullUrl(false); // Ocultar URL al editar
  };

  const handleCancelEditUrl = () => {
    setSurvey123Url(originalUrl);
    setIsEditingUrl(false);
    setShowFullUrl(false); // Ocultar URL al cancelar
  };

  const handleSaveUrl = async () => {
    if (!survey123Url.trim()) {
      showMessage('error', 'La URL no puede estar vacía');
      return;
    }

    try {
      setSaving(true);
      const response = await api.post('/api/configuration', {
        survey123_url: survey123Url,
        survey123_layer1_url: survey123Layer1Url,
        survey123_layer2_url: survey123Layer2Url
      });

      if (response.data.success) {
        setOriginalUrl(survey123Url);
        setIsEditingUrl(false);
        setShowFullUrl(false); // Ocultar URL después de guardar
        showMessage('success', '✓ URLs actualizadas correctamente en Supabase');
      }
    } catch (error) {
      console.error('Error al guardar URL:', error);
      showMessage('error', error.response?.data?.error || 'Error al guardar URL');
    } finally {
      setSaving(false);
    }
  };

  const getMappingStatus = (internalField) => {
    const surveyColumn = fieldMappings[internalField];

    if (!surveyColumn) return { status: 'unmapped', color: 'red', icon: AlertTriangle };

    if (syncData) {
      const exists = syncData.columns.some(col => col.name === surveyColumn);
      if (!exists) return { status: 'missing', color: 'orange', icon: AlertCircle };
    }

    return { status: 'ok', color: 'green', icon: CheckCircle };
  };

  // Mostrar loader mientras carga autenticación o datos
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-400">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  // Si no es superadmin, no mostrar nada (se redirigirá)
  if (!isSuperAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg hover:bg-white/10 dark:hover:bg-white/5 pink:hover:bg-white/20 transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-slate-700 dark:text-white pink:text-white" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 dark:text-white pink:text-white flex items-center gap-3">
                <Settings className="w-8 h-8" />
                Configuración Global
              </h1>
              <p className="text-slate-600 dark:text-slate-400 pink:text-white/80 mt-1">
                Gestiona el mapeo de columnas y credenciales de Survey123
              </p>
            </div>
          </div>
          <ThemeToggle theme={theme} onToggle={cycleTheme} />
        </div>

        {/* Mensaje de estado */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg flex items-center gap-3 ${message.type === 'success'
            ? 'bg-green-100 dark:bg-green-900/30 pink:bg-green-500/20 text-green-800 dark:text-green-300 pink:text-white'
            : 'bg-red-100 dark:bg-red-900/30 pink:bg-red-500/20 text-red-800 dark:text-red-300 pink:text-white'
            }`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            <span className="font-medium">{message.text}</span>
          </div>
        )}

        {/* Sección 1: URL de Survey123 */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-lg shadow-sm p-6 mb-6 border border-slate-200 dark:border-slate-700 pink:border-pink-300">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white pink:text-slate-900 mb-4 flex items-center gap-2">
            <LinkIcon className="w-5 h-5" />
            Conexión a Survey123
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-2">
                URL del Feature Service (Layer 0 - Puntos) {!isEditingUrl && <span className="text-xs text-slate-500 dark:text-slate-400">(leída desde Supabase)</span>}
              </label>

              {/* Mostrar URL en modo solo lectura o editable */}
              {!isEditingUrl ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 
                                  bg-slate-50 dark:bg-slate-900 pink:bg-pink-50/50
                                  text-slate-900 dark:text-white pink:text-slate-900 font-mono text-sm break-all">
                      {survey123Url ? (
                        showFullUrl ? survey123Url : truncateUrl(survey123Url)
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">No configurada</span>
                      )}
                    </div>

                    {/* Botones de acciones */}
                    {survey123Url && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowFullUrl(!showFullUrl)}
                          className="p-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600
                                   text-slate-700 dark:text-slate-300 transition-colors"
                          title={showFullUrl ? "Ocultar URL" : "Mostrar URL completa"}
                        >
                          {showFullUrl ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>

                        <button
                          onClick={copyUrlToClipboard}
                          className="p-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600
                                   text-slate-700 dark:text-slate-300 transition-colors"
                          title="Copiar URL"
                        >
                          {urlCopied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                        </button>
                      </div>
                    )}

                    <button
                      onClick={handleStartEditUrl}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 pink:bg-pink-500 pink:hover:bg-pink-600
                               text-white font-medium rounded-lg transition-colors whitespace-nowrap"
                    >
                      <Settings className="w-4 h-4" />
                      Modificar URLs
                    </button>
                  </div>

                  {urlCopied && (
                    <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      URL copiada al portapapeles
                    </div>
                  )}

                  {/* URLs adicionales en modo lectura */}
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Layer 1 (Descripciones)
                      </label>
                      <div className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-600 dark:text-slate-400 truncate">
                        {survey123Layer1Url || 'Automático (basado en Layer 0)'}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Layer 2 (Hechos)
                      </label>
                      <div className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-600 dark:text-slate-400 truncate">
                        {survey123Layer2Url || 'Automático (basado en Layer 0)'}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      URL Layer 0 (Puntos Principales) *
                    </label>
                    <input
                      type="text"
                      value={survey123Url}
                      onChange={(e) => setSurvey123Url(e.target.value)}
                      placeholder="https://services9.arcgis.com/.../FeatureServer/0"
                      className="w-full px-4 py-2 rounded-lg border border-blue-500 dark:border-blue-400 pink:border-pink-500 
                               bg-white dark:bg-slate-700 pink:bg-white
                               text-slate-900 dark:text-white pink:text-slate-900
                               focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 pink:focus:ring-pink-500 focus:border-transparent"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      URL Layer 1 (Descripciones) - Opcional
                    </label>
                    <input
                      type="text"
                      value={survey123Layer1Url}
                      onChange={(e) => setSurvey123Layer1Url(e.target.value)}
                      placeholder="https://services9.arcgis.com/.../FeatureServer/1"
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 
                               bg-white dark:bg-slate-700 text-slate-900 dark:text-white
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Si se deja vacío, se intentará deducir de la URL del Layer 0 cambiando /0 por /1</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                      URL Layer 2 (Hechos) - Opcional
                    </label>
                    <input
                      type="text"
                      value={survey123Layer2Url}
                      onChange={(e) => setSurvey123Layer2Url(e.target.value)}
                      placeholder="https://services9.arcgis.com/.../FeatureServer/2"
                      className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 
                               bg-white dark:bg-slate-700 text-slate-900 dark:text-white
                               focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                    <p className="text-xs text-slate-500 mt-1">Si se deja vacío, se intentará deducir de la URL del Layer 0 cambiando /0 por /2</p>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleSaveUrl}
                      disabled={saving || !survey123Url.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 
                               text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4" />
                          Guardar en Supabase
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleCancelEditUrl}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-600 dark:hover:bg-slate-500
                               text-slate-700 dark:text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {lastSyncAt && !isEditingUrl && (
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 pink:text-slate-600">
                <Info className="w-4 h-4" />
                Última sincronización: {new Date(lastSyncAt).toLocaleString('es-PE')}
              </div>
            )}

            {!isEditingUrl && (
              <button
                onClick={handleSync}
                disabled={syncing || !survey123Url.trim()}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 hover:bg-blue-700 pink:bg-pink-500 pink:hover:bg-pink-600 disabled:bg-slate-300 
                         text-white font-medium rounded-lg transition-colors disabled:cursor-not-allowed"
              >
                {syncing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sincronizando...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Sincronizar con Survey123
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Sección 2: Cambios detectados (si hay sync) */}
        {syncData && (
          <div className="bg-blue-50 dark:bg-blue-900/20 pink:bg-pink-50/50 rounded-lg p-6 mb-6 border border-blue-200 dark:border-blue-800 pink:border-pink-300">
            <h3 className="text-lg font-bold text-blue-900 dark:text-blue-300 pink:text-pink-700 mb-4">
              Resultado de Sincronización
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-slate-800 pink:bg-white/90 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-600 dark:text-green-400 pink:text-green-600">
                  {syncData.changes.new.length}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400 pink:text-slate-600">Columnas nuevas</div>
                {syncData.changes.new.length > 0 && (
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 pink:text-slate-500">
                    {syncData.changes.new.map(col => col.name).join(', ')}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-800 pink:bg-white/90 p-4 rounded-lg">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400 pink:text-red-600">
                  {syncData.changes.removed.length}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400 pink:text-slate-600">Columnas eliminadas</div>
                {syncData.changes.removed.length > 0 && (
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 pink:text-slate-500">
                    {syncData.changes.removed.map(col => col.name).join(', ')}
                  </div>
                )}
              </div>

              <div className="bg-white dark:bg-slate-800 pink:bg-white/90 p-4 rounded-lg">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 pink:text-orange-600">
                  {syncData.changes.orphanedMappings.length}
                </div>
                <div className="text-sm text-slate-600 dark:text-slate-400 pink:text-slate-600">Mapeos huérfanos</div>
                {syncData.changes.orphanedMappings.length > 0 && (
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 pink:text-slate-500">
                    {syncData.changes.orphanedMappings.map(m => m.internalKey).join(', ')}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Sección 3: Mapeo de campos */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-lg shadow-sm p-6 mb-6 border border-slate-200 dark:border-slate-700 pink:border-pink-300">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white pink:text-slate-900 flex items-center gap-2">
              <FileCode className="w-5 h-5" />
              Mapeo de Campos
            </h2>
            <button
              onClick={cleanOrphanedMappings}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-900/50
                       text-orange-800 dark:text-orange-300 font-medium rounded-lg transition-colors"
              title="Eliminar campos que ya no están en la lista de campos internos"
            >
              <AlertTriangle className="w-4 h-4" />
              Limpiar huérfanos
            </button>
          </div>

          <div className="space-y-3">
            {Object.entries(INTERNAL_FIELDS_METADATA).map(([internalField, metadata]) => {
              const status = getMappingStatus(internalField);
              const StatusIcon = status.icon;

              return (
                <div key={internalField} className="flex items-start gap-4 p-4 bg-slate-50 dark:bg-slate-700/50 pink:bg-slate-50/50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-slate-900 dark:text-white pink:text-slate-900">
                        {metadata.label}
                      </span>
                      {metadata.required && (
                        <span className="text-xs bg-red-100 dark:bg-red-900/30 pink:bg-red-500/20 text-red-800 dark:text-red-300 pink:text-red-900 px-2 py-0.5 rounded">
                          Requerido
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 pink:text-slate-600 mb-1">{metadata.description}</p>

                    {/* Mostrar alias interno (usado en la app) */}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400 pink:text-slate-500">
                        Alias interno:
                      </span>
                      <code className="text-xs bg-slate-200 dark:bg-slate-600 pink:bg-slate-200 text-slate-700 dark:text-slate-300 pink:text-slate-700 px-2 py-0.5 rounded">
                        {internalField}
                      </code>
                    </div>

                    {/* Mostrar columna de Survey123 mapeada */}
                    {fieldMappings[internalField] && (
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-slate-500 dark:text-slate-400 pink:text-slate-500">
                          Columna Survey123:
                        </span>
                        <code className="text-xs bg-blue-100 dark:bg-blue-900/30 pink:bg-pink-100 text-blue-800 dark:text-blue-300 pink:text-pink-800 px-2 py-0.5 rounded font-semibold">
                          {fieldMappings[internalField]}
                        </code>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`w-5 h-5 text-${status.color}-500`} />
                      {syncData ? (
                        <div className="flex flex-col">
                          <label className="text-xs text-slate-600 dark:text-slate-400 pink:text-slate-600 mb-1">
                            Mapear a columna de Survey123:
                          </label>
                          <select
                            value={fieldMappings[internalField] || ''}
                            onChange={(e) => handleMappingChange(internalField, e.target.value)}
                            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 
                                     bg-white dark:bg-slate-700 pink:bg-white
                                     text-slate-900 dark:text-white pink:text-slate-900
                                     focus:ring-2 focus:ring-blue-500 pink:focus:ring-pink-500 min-w-[250px]"
                          >
                            <option value="">-- Seleccionar columna --</option>
                            {syncData.columns.map(col => {
                              // Check if this column is already mapped to ANY internal field
                              const isMapped = Object.values(fieldMappings).includes(col.name);
                              // Check if it's mapped to THIS internal field
                              const isCurrent = fieldMappings[internalField] === col.name;

                              return (
                                <option
                                  key={col.name}
                                  value={col.name}
                                  className={isMapped && !isCurrent ? "bg-green-100 text-green-800 font-medium" : ""}
                                >
                                  {col.name} ({col.alias}) {isMapped && !isCurrent ? '✓' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      ) : (
                        <div className="flex flex-col">
                          <label className="text-xs text-slate-600 dark:text-slate-400 pink:text-slate-600 mb-1">
                            Columna de Survey123:
                          </label>
                          <input
                            type="text"
                            value={fieldMappings[internalField] || ''}
                            onChange={(e) => handleMappingChange(internalField, e.target.value)}
                            placeholder="Nombre de columna Survey123"
                            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 
                                     bg-white dark:bg-slate-700 pink:bg-white
                                     text-slate-900 dark:text-white pink:text-slate-900
                                     focus:ring-2 focus:ring-blue-500 pink:focus:ring-pink-500 min-w-[250px]"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sección 4: Configuración de fotografías */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-lg shadow-sm p-6 mb-6 border border-slate-200 dark:border-slate-700 pink:border-pink-300">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white pink:text-slate-900 mb-4 flex items-center gap-2">
            <Camera className="w-5 h-5" />
            Configuración de Fotografías
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-2">
                Nombre de tabla relacionada
              </label>
              <input
                type="text"
                value={photoConfig.table_name}
                onChange={(e) => handlePhotoConfigChange('table_name', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 
                         bg-white dark:bg-slate-700 pink:bg-white
                         text-slate-900 dark:text-white pink:text-slate-900
                         focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-2">
                Campo de relación
              </label>
              <input
                type="text"
                value={photoConfig.relationship_field}
                onChange={(e) => handlePhotoConfigChange('relationship_field', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 
                         bg-white dark:bg-slate-700 pink:bg-white
                         text-slate-900 dark:text-white pink:text-slate-900
                         focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-2">
                Campo de nombre de archivo
              </label>
              <input
                type="text"
                value={photoConfig.filename_field}
                onChange={(e) => handlePhotoConfigChange('filename_field', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 
                         bg-white dark:bg-slate-700 pink:bg-white
                         text-slate-900 dark:text-white pink:text-slate-900
                         focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-3">
              <div className="text-blue-600 dark:text-blue-400 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="text-sm text-blue-800 dark:text-blue-200">
                <p className="font-medium mb-1">Sincronización Automática</p>
                <p>
                  Las fotografías se sincronizan automáticamente desde los adjuntos del <strong>Layer 1 (Descripciones)</strong>.
                  Los archivos se descargan localmente y se registran en la base de datos.
                </p>
              </div>
            </div>
          </div>

          {/* Botón de guardar Survey123 - dentro de su sección */}
          <div className="flex justify-end mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 
                         text-white font-bold rounded-lg transition-colors disabled:cursor-not-allowed text-lg shadow-lg"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Guardar Configuración Survey123
                </>
              )}
            </button>
          </div>
        </div>

        {/* Sección: Configuración de IA */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-lg shadow-sm p-6 mb-6 border border-slate-200 dark:border-slate-700 pink:border-pink-300">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white pink:text-slate-900 mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-500" />
            Configuración de Inteligencia Artificial
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Configura la API Key y los modelos de Gemini para todas las funciones de IA de la aplicación.
          </p>

          <div className="space-y-4">
            {/* API Key */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-2">
                API Key de Gemini
              </label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={geminiApiKey}
                    onChange={(e) => setGeminiApiKey(e.target.value)}
                    placeholder="AIza..."
                    className="w-full px-4 py-2 pr-10 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 
                             bg-white dark:bg-slate-700 pink:bg-white
                             text-slate-900 dark:text-white pink:text-slate-900 font-mono text-sm
                             focus:ring-2 focus:ring-violet-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Obtén tu API Key en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-violet-500 hover:underline">Google AI Studio</a>
              </p>
            </div>

            {/* Modelo estándar */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-2">
                Modelo para Generación de Texto
              </label>
              <input
                type="text"
                value={geminiModel}
                onChange={(e) => setGeminiModel(e.target.value)}
                placeholder="gemini-2.5-flash"
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 
                         bg-white dark:bg-slate-700 pink:bg-white
                         text-slate-900 dark:text-white pink:text-slate-900 font-mono text-sm
                         focus:ring-2 focus:ring-violet-500"
              />
              <p className="text-xs text-slate-400 mt-1">
                Usado para: Mejorar redacción, generar descripciones. Ej: <code className="bg-slate-100 dark:bg-slate-600 px-1 rounded">gemini-2.5-flash</code>, <code className="bg-slate-100 dark:bg-slate-600 px-1 rounded">gemini-2.5-pro</code>
              </p>
            </div>

            {/* Modelo para expertos */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-2">
                Modelo para Revisión de Expertos
              </label>
              <input
                type="text"
                value={geminiModelExpert}
                onChange={(e) => setGeminiModelExpert(e.target.value)}
                placeholder="gemini-3-pro-preview"
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 
                         bg-white dark:bg-slate-700 pink:bg-white
                         text-slate-900 dark:text-white pink:text-slate-900 font-mono text-sm
                         focus:ring-2 focus:ring-violet-500"
              />
              <p className="text-xs text-slate-400 mt-1">
                Usado para: Experto Ambiental/Legal. Requiere soporte de Structured Output + Google Search. Ej: <code className="bg-slate-100 dark:bg-slate-600 px-1 rounded">gemini-3-pro-preview</code>
              </p>
            </div>

          </div>

          {/* Botón guardar AI config - estilo similar a Survey123 */}
          <div className="flex justify-end mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={handleSaveAIConfig}
              disabled={savingAI}
              className="flex items-center gap-2 px-8 py-3 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 
                       text-white font-bold rounded-lg transition-colors disabled:cursor-not-allowed text-lg shadow-lg"
            >
              {savingAI ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Guardar Configuración de IA
                </>
              )}
            </button>
          </div>

          {/* Info box */}
          <div className="mt-4 p-4 bg-violet-50 dark:bg-violet-900/20 rounded-lg border border-violet-200 dark:border-violet-800">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-violet-600 dark:text-violet-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-violet-800 dark:text-violet-200">
                <p className="font-medium mb-1">Configuración Centralizada</p>
                <p>
                  Esta configuración se sincroniza automáticamente a todos los usuarios al iniciar sesión.
                  Los cambios se aplican inmediatamente en toda la aplicación.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sección: Encabezado del Acta */}
        <div className="bg-white dark:bg-slate-800 pink:bg-white/95 rounded-lg shadow-sm p-6 mb-6 border border-slate-200 dark:border-slate-700 pink:border-pink-300">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white pink:text-slate-900 mb-4 flex items-center gap-2">
            <FileCode className="w-5 h-5 text-red-600" />
            Encabezado del Acta de Supervisión
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Configura el texto del Decenio y Año oficial que aparecerá en el encabezado de todas las actas exportadas.
            Estos textos deben actualizarse según las normativas vigentes.
          </p>

          <div className="space-y-4">
            {/* Decenio */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-2">
                Texto del Decenio
              </label>
              <input
                type="text"
                value={actaDecenio}
                onChange={(e) => setActaDecenio(e.target.value)}
                placeholder="«Decenio de la Igualdad de Oportunidades para Mujeres y Hombres»"
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 
                         bg-white dark:bg-slate-700 pink:bg-white
                         text-slate-900 dark:text-white pink:text-slate-900
                         focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-slate-400 mt-1">
                Texto del decenio vigente según el Decreto Supremo correspondiente.
              </p>
            </div>

            {/* Año */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-slate-700 mb-2">
                Texto del Año
              </label>
              <input
                type="text"
                value={actaAnio}
                onChange={(e) => setActaAnio(e.target.value)}
                placeholder="«Año de la Recuperación y Consolidación de la Economía Peruana»"
                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 pink:border-pink-300 
                         bg-white dark:bg-slate-700 pink:bg-white
                         text-slate-900 dark:text-white pink:text-slate-900
                         focus:ring-2 focus:ring-red-500"
              />
              <p className="text-xs text-slate-400 mt-1">
                Texto del año oficial según la Ley correspondiente (se actualiza cada año).
              </p>
            </div>
          </div>

          {/* Vista previa */}
          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">Vista previa del encabezado:</p>
            <div className="text-center">
              <p className="text-xs italic text-red-700 dark:text-red-400">{actaDecenio}</p>
              <p className="text-xs italic text-red-700 dark:text-red-400">{actaAnio}</p>
            </div>
          </div>

          {/* Botón guardar */}
          <div className="flex justify-end mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={handleSaveActaHeader}
              disabled={savingActaHeader}
              className="flex items-center gap-2 px-8 py-3 bg-red-600 hover:bg-red-700 disabled:bg-slate-300 
                       text-white font-bold rounded-lg transition-colors disabled:cursor-not-allowed text-lg shadow-lg"
            >
              {savingActaHeader ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Guardar Encabezado del Acta
                </>
              )}
            </button>
          </div>

          {/* Info box */}
          <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-red-800 dark:text-red-200">
                <p className="font-medium mb-1">Importante</p>
                <p>
                  Los cambios en estos campos afectarán a todas las actas generadas en adelante.
                  Asegúrese de verificar la normativa vigente antes de realizar cambios.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

  );
}
