import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AvisosProvider } from './componentes/Avisos.jsx';
import Layout from './componentes/Layout.jsx';
import { Cargando } from './componentes/ui.jsx';
import { rutaInicio, SesionProvider, useSesion } from './sesion/SesionProvider.jsx';
import Login from './paginas/Login.jsx';
import Registro from './paginas/Registro.jsx';

// Cada rol descarga solo su propio código (code splitting)
const InicioAlumno = lazy(() => import('./paginas/alumno/Inicio.jsx'));
const OfertaCursos = lazy(() => import('./paginas/alumno/OfertaCursos.jsx'));
const MiMatricula = lazy(() => import('./paginas/alumno/MiMatricula.jsx'));
const PagosAlumno = lazy(() => import('./paginas/alumno/Pagos.jsx'));
const Notificaciones = lazy(() => import('./paginas/alumno/Notificaciones.jsx'));
const PanelAdmin = lazy(() => import('./paginas/admin/Panel.jsx'));
const CursosAdmin = lazy(() => import('./paginas/admin/Cursos.jsx'));
const MatriculasAdmin = lazy(() => import('./paginas/admin/Matriculas.jsx'));
const AlumnosAdmin = lazy(() => import('./paginas/admin/Alumnos.jsx'));
const Microservicios = lazy(() => import('./paginas/admin/Microservicios.jsx'));

function PantallaCarga() {
  return <div className="pantalla-centro"><Cargando texto="Verificando sesión…" /></div>;
}

function RutaProtegida({ rol }) {
  const { usuario } = useSesion();
  const location = useLocation();
  if (usuario === undefined) return <PantallaCarga />;
  if (!usuario) return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  if (usuario.rol !== rol) return <Navigate to={rutaInicio(usuario)} replace />;
  return <Outlet />;
}

function SoloInvitados() {
  const { usuario } = useSesion();
  if (usuario === undefined) return <PantallaCarga />;
  if (usuario) return <Navigate to={rutaInicio(usuario)} replace />;
  return <Outlet />;
}

function Raiz() {
  const { usuario } = useSesion();
  if (usuario === undefined) return <PantallaCarga />;
  return <Navigate to={usuario ? rutaInicio(usuario) : '/login'} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <SesionProvider>
        <AvisosProvider>
          <Suspense fallback={<PantallaCarga />}>
            <Routes>
              <Route path="/" element={<Raiz />} />
              <Route element={<SoloInvitados />}>
                <Route path="/login" element={<Login />} />
                <Route path="/registro" element={<Registro />} />
              </Route>

              <Route element={<RutaProtegida rol="alumno" />}>
                <Route path="/alumno" element={<Layout />}>
                  <Route index element={<InicioAlumno />} />
                  <Route path="cursos" element={<OfertaCursos />} />
                  <Route path="matricula" element={<MiMatricula />} />
                  <Route path="pagos" element={<PagosAlumno />} />
                  <Route path="notificaciones" element={<Notificaciones />} />
                </Route>
              </Route>

              <Route element={<RutaProtegida rol="admin" />}>
                <Route path="/admin" element={<Layout />}>
                  <Route index element={<PanelAdmin />} />
                  <Route path="cursos" element={<CursosAdmin />} />
                  <Route path="matriculas" element={<MatriculasAdmin />} />
                  <Route path="alumnos" element={<AlumnosAdmin />} />
                  <Route path="microservicios" element={<Microservicios />} />
                </Route>
              </Route>

              <Route path="*" element={<Raiz />} />
            </Routes>
          </Suspense>
        </AvisosProvider>
      </SesionProvider>
    </BrowserRouter>
  );
}
