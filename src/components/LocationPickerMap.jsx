import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './location-picker-map.css'

function coordinates(lat, lon) {
  const latitude = Number(lat), longitude = Number(lon)
  return lat !== '' && lon !== '' && Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 85 && Math.abs(longitude) <= 180 ? [latitude, longitude] : null
}

export default function LocationPickerMap({ latitude, longitude, onChange }) {
  const host = useRef(null)
  const map = useRef(null)
  const marker = useRef(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current || map.current) return undefined
    const instance = L.map(host.current, { center: [0, 0], zoom: 2, scrollWheelZoom: false })
    L.tileLayer(import.meta.env.VITE_OSM_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(instance)
    instance.on('click', event => {
      const point = [Number(event.latlng.lat.toFixed(6)), Number(event.latlng.lng.toFixed(6))]
      onChangeRef.current(point[0], point[1])
    })
    map.current = instance
    const saved = coordinates(latitude, longitude)
    if (saved) {
      instance.setView(saved, 15)
      marker.current = L.marker(saved, { draggable: true }).addTo(instance)
      marker.current.on('dragend', () => {
        const point = marker.current.getLatLng()
        onChangeRef.current(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6)))
      })
    }
    const resize = () => instance.invalidateSize({ pan: false })
    const observer = new ResizeObserver(resize)
    observer.observe(host.current)
    return () => {
      observer.disconnect()
      instance.remove()
      map.current = null
      marker.current = null
    }
  // Initialize Leaflet once. Changes are synchronized in the following effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    const point = coordinates(latitude, longitude)
    if (!point) {
      marker.current?.remove()
      marker.current = null
      return
    }
    if (!marker.current) {
      marker.current = L.marker(point, { draggable: true }).addTo(instance)
      marker.current.on('dragend', () => {
        const next = marker.current.getLatLng()
        onChangeRef.current(Number(next.lat.toFixed(6)), Number(next.lng.toFixed(6)))
      })
    } else marker.current.setLatLng(point)
    if (instance.getZoom() < 3 || !instance.getBounds().contains(point)) instance.setView(point, 15)
  }, [latitude, longitude])

  return <div className="location-picker-map-wrap"><div ref={host} className="location-picker-map" role="application" aria-label="Mapa OpenStreetMap: haz clic para colocar o arrastra el marcador para ajustar la ubicación" /><button className="location-picker-center" type="button" onClick={() => { const point = map.current?.getCenter(); if (point) onChangeRef.current(Number(point.lat.toFixed(6)), Number(point.lng.toFixed(6))) }}>Colocar marcador en el centro del mapa</button>
    <p className="location-picker-attribution">Mapa © OpenStreetMap contributors. <a href="https://www.openstreetmap.org/fixthemap">Informar un problema del mapa</a></p></div>
}
