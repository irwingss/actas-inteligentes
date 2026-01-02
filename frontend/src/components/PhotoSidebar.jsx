/**
 * PhotoSidebar - Sidebar filtrador de fotografías para el chatbot
 * Permite filtrar y visualizar fotos con paginación
 * Usa PhotoDetailModal para visualización/edición completa
 */

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronLeft, ChevronRight, Image as ImageIcon, Filter, RefreshCw, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { PhotoDetailModal } from './actas/PhotoDetailModal';

// Helper para generar ID único por foto (debe coincidir con otros componentes)
const getPhotoUniqueId = (foto) => {
  if (!foto) return null;
  return `${foto.globalid || foto.gid}_${foto.filename || ''}`;
};

export default function PhotoSidebar({ caCode, initialFilters = null, onClose, onPhotoSelect, onAnalyzePhotos, compactMode = false }) {
  const { session } = useAuth();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasFilters, setHasFilters] = useState(false);
  const [filteredRecordsCount, setFilteredRecordsCount] = useState(0);
  const pageSize = compactMode ? 16 : 12; // Más fotos en modo compacto (4x4 grid)

  // Estados de filtros
  const [filters, setFilters] = useState({
    dateFrom: '',
    dateTo: '',
    supervisor: '',
    tipo_componente: '',
    componente: '',
    instalacion_referencia: '',
    hecho_detec: '',
    tipo_de_reporte: '',
    subcomponente: ''
  });
  
  // Aplicar filtros iniciales de Gemini cuando cambien
  useEffect(() => {
    if (initialFilters) {
      console.log('[PhotoSidebar] 📦 Aplicando filtros de Gemini:', initialFilters);
      setFilters(prev => ({ ...prev, ...initialFilters }));
      // NO expandir filtros - solo contar fotos sin mostrar UI
    }
  }, [initialFilters]);

  // Opciones de filtros (se cargarán dinámicamente)
  const [filterOptions, setFilterOptions] = useState({
    supervisores: [],
    tipos_componente: [],
    componentes: [],
    instalaciones: [],
    hechos: [],
    tipos_reporte: [],
    subcomponentes: []
  });

  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  
  // Estado para PhotoDetailModal (reemplaza el lightbox simple)
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  
  // Estados para edición de descripciones (como en HechosSection)
  const [descripcionesEditadas, setDescripcionesEditadas] = useState({});
  const [savingDescripcion, setSavingDescripcion] = useState(null);
  const [photoAnnotations, setPhotoAnnotations] = useState({});

  // Cargar opciones de filtros al montar
  useEffect(() => {
    loadFilterOptions();
  }, [caCode]);

  // Cargar fotos cuando cambien los filtros o la página
  useEffect(() => {
    if (caCode) {
      loadPhotos();
    }
  }, [caCode, page, filters]);

  // Cargar descripciones editadas cuando cambian las fotos
  useEffect(() => {
    if (photos.length > 0 && session?.access_token) {
      loadDescripcionesEditadas(photos);
    }
  }, [photos, session?.access_token]);
  
  // Cargar descripciones editadas del backend
  const loadDescripcionesEditadas = async (fotosArray) => {
    if (!session?.access_token || !fotosArray?.length) return;
    
    try {
      const photoIds = fotosArray.map(f => getPhotoUniqueId(f)).filter(Boolean);
      if (photoIds.length === 0) return;
      
      const response = await axios.get(
        `/api/s123/direct/descripciones-por-fotos?photoIds=${encodeURIComponent(photoIds.join(','))}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      
      if (response.data.success && response.data.descripciones) {
        setDescripcionesEditadas(response.data.descripciones);
      }
    } catch (err) {
      console.warn('[PhotoSidebar] Error cargando descripciones:', err.message);
    }
  };
  
  // Manejar cambio de descripción
  const handleDescripcionChange = (photoId, texto) => {
    setDescripcionesEditadas(prev => ({
      ...prev,
      [photoId]: texto
    }));
  };
  
  // Guardar descripción editada
  const guardarDescripcion = async (photoId, texto) => {
    if (!session?.access_token) return;
    
    setSavingDescripcion(photoId);
    try {
      await axios.put(
        `/api/s123/direct/descripcion/${encodeURIComponent(photoId)}`,
        { campo: 'descrip_1', valor: texto },
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      
      setDescripcionesEditadas(prev => ({
        ...prev,
        [photoId]: texto
      }));
      
      toast.success('Descripción guardada');
    } catch (error) {
      console.error('Error guardando descripción:', error);
      toast.error('Error al guardar');
    } finally {
      setSavingDescripcion(null);
    }
  };
  
  // Revertir a descripción original
  const revertirDescripcion = async (photoId, descripcionOriginal) => {
    setSavingDescripcion(photoId);
    try {
      await axios.put(
        `/api/s123/direct/descripcion/${encodeURIComponent(photoId)}`,
        { campo: 'descrip_1', valor: null },
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      
      setDescripcionesEditadas(prev => ({
        ...prev,
        [photoId]: descripcionOriginal || ''
      }));
      
      toast.success('Descripción revertida');
    } catch (error) {
      console.error('Error revirtiendo descripción:', error);
      toast.error('Error al revertir');
    } finally {
      setSavingDescripcion(null);
    }
  };
  
  // Manejar cambio de anotaciones
  const handleAnnotationsChange = (photoId, annotations) => {
    setPhotoAnnotations(prev => ({
      ...prev,
      [photoId]: annotations
    }));
  };
  
  // Navegar entre fotos en el modal
  const navigatePhotoModal = (newIndex) => {
    if (newIndex >= 0 && newIndex < transformedPhotos.length) {
      setSelectedPhotoIndex(newIndex);
    }
  };

  const loadFilterOptions = async () => {
    setLoadingOptions(true);
    try {
      // Obtener valores únicos para cada campo filtrable
      const [supervisores, tipos, componentes, instalaciones, hechos, tiposReporte, subcomps] = await Promise.all([
        fetchUniqueValues('nombre_supervisor'),
        fetchUniqueValues('tipo_componente'),
        fetchUniqueValues('componente'),
        fetchUniqueValues('instalacion_referencia'),
        fetchUniqueValues('hecho_detec'),
        fetchUniqueValues('tipo_de_reporte'),
        fetchUniqueValues('subcomponente')
      ]);

      setFilterOptions({
        supervisores: supervisores || [],
        tipos_componente: tipos || [],
        componentes: componentes || [],
        instalaciones: instalaciones || [],
        hechos: hechos || [],
        tipos_reporte: tiposReporte || [],
        subcomponentes: subcomps || []
      });
    } catch (error) {
      console.error('Error cargando opciones de filtros:', error);
    } finally {
      setLoadingOptions(false);
    }
  };

  const fetchUniqueValues = async (field) => {
    try {
      const response = await axios.get(`/api/s123/unique-values/${caCode}/${field}`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });
      return response.data.values || [];
    } catch (error) {
      console.error(`Error obteniendo valores únicos de ${field}:`, error);
      return [];
    }
  };

  const loadPhotos = async () => {
    setLoading(true);
    try {
      // Construir query params con filtros activos
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString()
      });

      // Agregar filtros no vacíos
      Object.entries(filters).forEach(([key, value]) => {
        if (value && value.trim()) {
          params.append(key, value);
        }
      });

      const response = await axios.get(`/api/s123/photos-by-ca/${caCode}?${params}`, {
        headers: {
          Authorization: `Bearer ${session?.access_token}`
        }
      });

      if (response.data) {
        setPhotos(response.data.groups || []);
        setTotal(response.data.total || 0);
        setTotalPages(Math.ceil((response.data.total || 0) / pageSize));
        setHasFilters(response.data.hasFilters || false);
        setFilteredRecordsCount(response.data.filteredRecordsCount || 0);
      }
    } catch (error) {
      console.error('Error cargando fotos:', error);
      setPhotos([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
    setPage(1); // Reset a primera página al cambiar filtros
  };

  const clearFilters = () => {
    setFilters({
      dateFrom: '',
      dateTo: '',
      supervisor: '',
      tipo_componente: '',
      componente: '',
      instalacion_referencia: '',
      hecho_detec: '',
      tipo_de_reporte: '',
      subcomponente: ''
    });
    setPage(1);
  };

  // Transformar fotos del backend al formato que espera PhotoDetailModal
  const transformedPhotos = photos.map(photo => ({
    // Identificadores
    filename: photo.filename,
    gid: photo.gid,
    globalid: photo.gid,
    layerId: photo.layerId || 1, // Layer de origen: 1=Descripcion, 2=Hechos
    url: `/api/s123/direct/photo/${caCode}/${photo.gid}/${encodeURIComponent(photo.filename)}?token=${session?.access_token || ''}`,
    
    // Metadata
    componente: photo.metadata?.componente || '',
    tipo_componente: photo.metadata?.tipo_componente || '',
    supervisor: photo.metadata?.supervisor || '',
    nombre_supervisor: photo.metadata?.supervisor || '',
    fecha: photo.metadata?.fecha || '',
    hecho_detec: photo.hecho_detec_especifico || photo.metadata?.hecho_detec || '',
    instalacion_referencia: photo.metadata?.instalacion_referencia || '',
    
    // Descripción específica de esta foto (viene del backend según layer_id)
    descripcion: photo.descripcion || '',
    descripcion_original: photo.descripcion || ''
  }));

  const handlePhotoClick = (photo) => {
    setSelectedPhoto(photo);
    if (onPhotoSelect) {
      onPhotoSelect(photo);
    }
  };
  
  // Abrir modal de foto con doble clic
  const handlePhotoDoubleClick = (photo, index) => {
    setSelectedPhotoIndex(index);
    setPhotoModalOpen(true);
  };

  // Manejar drag start - IMPORTANTE: stopPropagation para evitar conflicto con Tauri
  const handleDragStart = (e, photo) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(photo));
    e.dataTransfer.setData('text/plain', photo.filename || 'photo'); // Fallback para compatibilidad
    console.log('[PhotoSidebar] 👉 Arrastrando foto:', photo);
  };

  const hasActiveFilters = Object.values(filters).some(v => v && v.trim());

  return (
    <div className="w-full h-full bg-white dark:bg-slate-800 pink:bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-slate-200 dark:border-slate-700 pink:border-pink-300 bg-gradient-to-r from-blue-50 to-slate-50 dark:from-slate-900 dark:to-slate-800 pink:from-pink-100 pink:to-rose-100">
        {/* Título y botón cerrar */}
        <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 pink:text-pink-600" />
          <div>
            <h3 className="font-semibold text-sm text-slate-900 dark:text-white pink:text-pink-900">
              Fotografías
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 pink:text-pink-600">
              {total} fotos disponibles
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 pink:hover:bg-pink-200 transition-colors"
          title="Cerrar panel de fotos"
        >
          <X className="w-4 h-4 text-slate-600 dark:text-slate-300 pink:text-pink-700" />
        </button>
        </div>
      </div>

      {/* Filtros - Colapsables */}
      <div className="border-b border-slate-200 dark:border-slate-700 pink:border-pink-300 bg-slate-50 dark:bg-slate-900/50 pink:bg-pink-50/50">
        {/* Header de filtros - siempre visible */}
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setFiltersExpanded(!filtersExpanded)}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            <Filter className="w-4 h-4 text-slate-600 dark:text-slate-400 pink:text-pink-600" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 pink:text-pink-800">
              Filtros
            </span>
            {hasActiveFilters && (
              <span className="text-xs bg-blue-100 dark:bg-blue-900 pink:bg-pink-100 text-blue-700 dark:text-blue-300 pink:text-pink-700 px-2 py-0.5 rounded-full">
                {Object.values(filters).filter(v => v).length}
              </span>
            )}
            {filtersExpanded ? (
              <ChevronUp className="w-4 h-4 text-slate-600 dark:text-slate-400 pink:text-pink-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-600 dark:text-slate-400 pink:text-pink-600" />
            )}
          </button>
          
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-blue-600 dark:text-blue-400 pink:text-pink-600 hover:underline flex items-center gap-1 px-2 py-1"
            >
              <RefreshCw className="w-3 h-3" />
              Limpiar
            </button>
          )}
        </div>

        {/* Contenido de filtros - colapsable */}
        {filtersExpanded && (
          <div className="px-4 pb-4 pt-2">
            {loadingOptions ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-2 chat-scrollbar">
            {/* Filtro de Fechas - Ancho completo */}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 pink:text-pink-700 mb-0.5">
                  Fecha Desde
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
                  className="w-full px-1.5 py-1 text-[11px] border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-slate-100 pink:text-pink-900 focus:ring-1 focus:ring-blue-500 pink:focus:ring-pink-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 pink:text-pink-700 mb-0.5">
                  Fecha Hasta
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => handleFilterChange('dateTo', e.target.value)}
                  className="w-full px-1.5 py-1 text-[11px] border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-slate-100 pink:text-pink-900 focus:ring-1 focus:ring-blue-500 pink:focus:ring-pink-500"
                />
              </div>
            </div>

            {/* Grid de 2 columnas para filtros principales */}
            <div className="grid grid-cols-2 gap-2">
              {/* Filtro de Supervisor */}
              {filterOptions.supervisores.length > 0 && (
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 pink:text-pink-700 mb-0.5">
                    Supervisor
                  </label>
                  <select
                    value={filters.supervisor}
                    onChange={(e) => handleFilterChange('supervisor', e.target.value)}
                    className="w-full px-1.5 py-1 text-[11px] border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-slate-100 pink:text-pink-900 focus:ring-1 focus:ring-blue-500 pink:focus:ring-pink-500"
                  >
                    <option value="">Todos</option>
                    {filterOptions.supervisores.map((sup) => (
                      <option key={sup} value={sup}>
                        {sup.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtro de Tipo de Componente */}
              {filterOptions.tipos_componente.length > 0 && (
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 pink:text-pink-700 mb-0.5">
                    Tipo Componente
                  </label>
                  <select
                    value={filters.tipo_componente}
                    onChange={(e) => handleFilterChange('tipo_componente', e.target.value)}
                    className="w-full px-1.5 py-1 text-[11px] border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-slate-100 pink:text-pink-900 focus:ring-1 focus:ring-blue-500 pink:focus:ring-pink-500"
                  >
                    <option value="">Todos</option>
                    {filterOptions.tipos_componente.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtro de Componente */}
              {filterOptions.componentes.length > 0 && (
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 pink:text-pink-700 mb-0.5">
                    Componente
                  </label>
                  <select
                    value={filters.componente}
                    onChange={(e) => handleFilterChange('componente', e.target.value)}
                    className="w-full px-1.5 py-1 text-[11px] border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-slate-100 pink:text-pink-900 focus:ring-1 focus:ring-blue-500 pink:focus:ring-pink-500"
                  >
                    <option value="">Todos</option>
                    {filterOptions.componentes.map((comp) => (
                      <option key={comp} value={comp}>
                        {comp}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtro de Subcomponente */}
              {filterOptions.subcomponentes.length > 0 && (
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 pink:text-pink-700 mb-0.5">
                    Subcomponente
                  </label>
                  <select
                    value={filters.subcomponente}
                    onChange={(e) => handleFilterChange('subcomponente', e.target.value)}
                    className="w-full px-1.5 py-1 text-[11px] border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-slate-100 pink:text-pink-900 focus:ring-1 focus:ring-blue-500 pink:focus:ring-pink-500"
                  >
                    <option value="">Todos</option>
                    {filterOptions.subcomponentes.map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtro de Instalación de Referencia */}
              {filterOptions.instalaciones.length > 0 && (
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 pink:text-pink-700 mb-0.5">
                    Instalación Ref.
                  </label>
                  <select
                    value={filters.instalacion_referencia}
                    onChange={(e) => handleFilterChange('instalacion_referencia', e.target.value)}
                    className="w-full px-1.5 py-1 text-[11px] border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-slate-100 pink:text-pink-900 focus:ring-1 focus:ring-blue-500 pink:focus:ring-pink-500"
                  >
                    <option value="">Todas</option>
                    {filterOptions.instalaciones.map((inst) => (
                      <option key={inst} value={inst}>
                        {inst}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtro de Tipo de Reporte */}
              {filterOptions.tipos_reporte.length > 0 && (
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 pink:text-pink-700 mb-0.5">
                    Tipo Reporte
                  </label>
                  <select
                    value={filters.tipo_de_reporte}
                    onChange={(e) => handleFilterChange('tipo_de_reporte', e.target.value)}
                    className="w-full px-1.5 py-1 text-[11px] border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-slate-100 pink:text-pink-900 focus:ring-1 focus:ring-blue-500 pink:focus:ring-pink-500"
                  >
                    <option value="">Todos</option>
                    {filterOptions.tipos_reporte.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        {tipo}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Filtro de Hecho Detectado */}
              {filterOptions.hechos.length > 0 && (
                <div>
                  <label className="block text-[10px] font-medium text-slate-600 dark:text-slate-400 pink:text-pink-700 mb-0.5">
                    Hecho Detectado
                  </label>
                  <select
                    value={filters.hecho_detec}
                    onChange={(e) => handleFilterChange('hecho_detec', e.target.value)}
                    className="w-full px-1.5 py-1 text-[11px] border border-slate-300 dark:border-slate-600 pink:border-pink-300 rounded bg-white dark:bg-slate-700 pink:bg-white text-slate-900 dark:text-slate-100 pink:text-pink-900 focus:ring-1 focus:ring-blue-500 pink:focus:ring-pink-500"
                  >
                    <option value="">Todos</option>
                    {filterOptions.hechos.map((hecho) => (
                      <option key={hecho} value={hecho}>
                        {hecho}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid de Fotos */}
      <div className="flex-1 overflow-y-auto p-4 chat-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 pink:text-pink-500 mx-auto mb-2" />
              <p className="text-sm text-slate-600 dark:text-slate-400 pink:text-pink-600">
                Cargando fotografías...
              </p>
            </div>
          </div>
        ) : photos.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center px-4">
              <ImageIcon className="w-12 h-12 text-slate-300 dark:text-slate-600 pink:text-pink-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400 pink:text-pink-600 mb-1">
                {hasFilters && filteredRecordsCount === 0 
                  ? 'No hay registros en ese rango' 
                  : 'No hay fotografías'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-500 pink:text-pink-500">
                {hasFilters && filteredRecordsCount === 0 
                  ? (filters.dateFrom || filters.dateTo 
                      ? 'No se encontraron registros en las fechas seleccionadas' 
                      : 'No se encontraron registros con los filtros aplicados')
                  : hasFilters && filteredRecordsCount > 0
                    ? `Se encontraron ${filteredRecordsCount} registros pero sin fotografías`
                    : hasActiveFilters 
                      ? 'Intenta ajustar los filtros' 
                      : 'No se encontraron fotos para este CA'}
              </p>
            </div>
          </div>
        ) : (
          <div className={`grid gap-2 ${compactMode ? 'grid-cols-4' : 'grid-cols-2 gap-3'}`}>
            {photos.map((photo, idx) => (
              <div
                key={`${photo.gid}-${photo.filename}-${idx}`}
                draggable="true"
                onDragStart={(e) => handleDragStart(e, photo)}
                onDoubleClick={() => handlePhotoDoubleClick(photo, idx)}
                className={`group relative aspect-square rounded-lg overflow-hidden border-2 border-slate-200 dark:border-slate-700 pink:border-pink-300 hover:border-blue-500 dark:hover:border-blue-400 pink:hover:border-pink-500 transition-all cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md ${compactMode ? 'rounded-md' : ''}`}
                onClick={() => handlePhotoClick(photo)}
              >
                {/* Thumbnail */}
                <img
                  src={`/api/s123/direct/photo/${caCode}/${photo.gid}/${photo.filename}?token=${session?.access_token || ''}`}
                  alt={`Foto de ${photo.metadata?.componente || 'componente'}`}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                
                {/* Overlay con info - más compacto en modo compacto */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className={`absolute bottom-0 left-0 right-0 text-white ${compactMode ? 'p-1' : 'p-2'}`}>
                    <p className={`font-medium truncate ${compactMode ? 'text-[9px]' : 'text-xs'}`}>
                      {photo.metadata?.componente || 'Sin componente'}
                    </p>
                    {!compactMode && photo.metadata?.hecho_detec && (
                      <p className="text-[10px] opacity-90 truncate">
                        {photo.metadata.hecho_detec}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 pink:border-pink-300 bg-slate-50 dark:bg-slate-900/50 pink:bg-pink-50/50">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1 || loading}
              className="p-2 rounded-md border border-slate-300 dark:border-slate-600 pink:border-pink-300 hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300 pink:text-pink-700" />
            </button>

            <div className="text-xs text-slate-600 dark:text-slate-400 pink:text-pink-700 font-medium">
              Página {page} de {totalPages}
            </div>

            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages || loading}
              className="p-2 rounded-md border border-slate-300 dark:border-slate-600 pink:border-pink-300 hover:bg-slate-100 dark:hover:bg-slate-700 pink:hover:bg-pink-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300 pink:text-pink-700" />
            </button>
          </div>
        </div>
      )}

      {/* Modal de foto con funcionalidad completa (mismo que en Hechos) */}
      <PhotoDetailModal
        isOpen={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        foto={transformedPhotos[selectedPhotoIndex]}
        fotos={transformedPhotos}
        currentIndex={selectedPhotoIndex}
        onNavigate={navigatePhotoModal}
        descripcionesEditadas={descripcionesEditadas}
        metadataEditadas={{}}
        annotations={photoAnnotations}
        onAnnotationsChange={handleAnnotationsChange}
        onDescripcionChange={handleDescripcionChange}
        onGuardarDescripcion={guardarDescripcion}
        onRevertDescripcion={revertirDescripcion}
        onMetadataChange={() => {}}
        onGuardarMetadata={() => {}}
        savingDescripcion={savingDescripcion}
        savingMetadata={null}
      />
    </div>
  );
}
