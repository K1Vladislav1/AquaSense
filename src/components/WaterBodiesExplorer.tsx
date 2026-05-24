'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { WaterBody } from '@/types';

const LAKE_PLACEHOLDER_IMAGE = '/images/lakes/Blue-Lake-Clipart.webp';

const MapSelector = dynamic(
  () => import('./MapSelector').then((mod) => mod.MapSelector),
  {
    ssr: false,
    loading: () => (
      <div className="wb-map-empty wb-map-empty--center">
        Загрузка карты...
      </div>
    ),
  },
);

export function WaterBodiesExplorer() {
  const [waterBodies, setWaterBodies] = useState<WaterBody[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectionVersion, setSelectionVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkScreen = () => {
      const mobile = window.innerWidth <= 960;
      setIsMobile(mobile);

      if (mobile) {
        setIsSidebarOpen(false);
      } else {
        setIsSidebarOpen(true);
      }
    };

    checkScreen();
    window.addEventListener('resize', checkScreen);

    return () => {
      window.removeEventListener('resize', checkScreen);
    };
  }, []);

  useEffect(() => {
    void api
      .getWaterBodies()
      .then((items) => {
        setWaterBodies(items);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : 'Не удалось загрузить список озёр',
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const filteredWaterBodies = useMemo(() => {
    const query = search.trim().toLowerCase();
    const source = query
      ? waterBodies.filter((item) => item.name.toLowerCase().includes(query))
      : waterBodies;

    return [...source].sort((a, b) =>
      a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }),
    );
  }, [search, waterBodies]);

  const selectedWaterBody = useMemo(() => {
    return filteredWaterBodies.find((item) => item.id === selectedId) ?? null;
  }, [filteredWaterBodies, selectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setSelectionVersion((version) => version + 1);

    if (isMobile) {
      setIsSidebarOpen(false);
    }
  };

  const formatArea = (value?: number | null) => {
    if (value == null) {
      return 'Не указана';
    }

    return `${(value / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} км²`;
  };

  const formatDepth = (value?: number | null) => {
    if (value == null) {
      return 'Не указана';
    }

    return `${value} м`;
  };

  if (loading) {
    return (
      <div className="wb-map-empty wb-map-empty--center">
        Загрузка карты и списка озёр...
      </div>
    );
  }

  if (error) {
    return <div className="wb-map-empty wb-map-empty--center">{error}</div>;
  }

  return (
    <div className="wb-map-shell">
      <div
        className={`wb-map-page ${
          !isSidebarOpen ? 'wb-map-page--sidebar-collapsed' : ''
        }`}
      >
        {!isSidebarOpen && (
          <button
            type="button"
            className="wb-map-toggle"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Открыть список озёр"
          >
            ☰
          </button>
        )}

        {isMobile && isSidebarOpen && (
          <div
            className="wb-map-overlay"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <aside
          className={`wb-map-sidebar ${
            isSidebarOpen ? 'wb-map-sidebar--open' : 'wb-map-sidebar--closed'
          }`}
        >
          <div className="wb-map-sidebar__top">
            <div className="wb-map-sidebar__top-row">
              <div>
                <h2 className="wb-map-sidebar__title">Карта озёр</h2>
                <p className="wb-map-sidebar__subtitle">
                  Выберите озеро в списке или на карте
                </p>
              </div>

              <button
                type="button"
                className="wb-map-sidebar__close"
                onClick={() => setIsSidebarOpen(false)}
                aria-label="Закрыть список озёр"
              >
                ✕
              </button>
            </div>

            <div className="wb-map-search">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                type="text"
                className="wb-map-search__input"
                placeholder="Поиск по названию озера..."
              />
            </div>
          </div>

          <div className="wb-map-sidebar__list">
            {filteredWaterBodies.length === 0 ? (
              <div className="wb-map-empty">Ничего не найдено</div>
            ) : (
              filteredWaterBodies.map((lake) => (
                <button
                  key={lake.id}
                  type="button"
                  className={`wb-lake-card ${
                    selectedId === lake.id ? 'wb-lake-card--active' : ''
                  }`}
                  onClick={() => handleSelect(lake.id)}
                >
                  <div className="wb-lake-card__image-wrap">
                    <img
                      src={
                        lake.imageUrl || LAKE_PLACEHOLDER_IMAGE
                      }
                      alt={lake.name}
                      className="wb-lake-card__image"
                    />
                  </div>

                  <div className="wb-lake-card__content">
                    <div className="wb-lake-card__head">
                      <h3 className="wb-lake-card__title">{lake.name}</h3>
                    </div>

                    <div className="wb-lake-card__meta">
                      <div className="wb-lake-card__meta-row">
                        <span className="wb-lake-card__label">Район:</span>
                        <span className="wb-lake-card__value">
                          {lake.district || 'Не указан'}
                        </span>
                      </div>

                      <div className="wb-lake-card__meta-row">
                        <span className="wb-lake-card__label">Площадь:</span>
                        <span className="wb-lake-card__value">
                          {formatArea(lake.passport?.area)}
                        </span>
                      </div>

                      <div className="wb-lake-card__meta-row">
                        <span className="wb-lake-card__label">Глубина:</span>
                        <span className="wb-lake-card__value">
                          {formatDepth(lake.passport?.maxDepth)}
                        </span>
                      </div>
                    </div>

                    <div className="wb-lake-card__actions">
                      <Link
                        href={`/water-bodies/${lake.id}`}
                        className="wb-lake-card__link"
                        onClick={(event) => event.stopPropagation()}
                      >
                        Дашборд водоёма
                      </Link>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <div className="wb-map-content">
          <MapSelector
            waterBodies={filteredWaterBodies}
            selectedId={selectedId}
            selectionVersion={selectionVersion}
            onSelect={handleSelect}
            isSidebarOpen={isSidebarOpen}
          />

        </div>
      </div>
    </div>
  );
}
