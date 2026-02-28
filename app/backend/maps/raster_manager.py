import rasterio
import numpy as np


class RasterManager:
  def __init__(self, ortho_path, dem_path):
    self.ortho = rasterio.open(ortho_path)
    self.dem = rasterio.open(dem_path)

    self.transform = self.ortho.transform

  def geo_to_pixel(self, lat, lon):
    row, col = self.ortho.index(lon, lat)
    return col, row

  def pixel_to_geo(self, x, y):
    lon, lat = self.ortho.xy(y, x)
    return lat, lon

  def crop_patch(self, center_lat, center_lon, size_m=4000):
    px, py = self.geo_to_pixel(center_lat, center_lon)

    meters_per_pixel = self.transform.a
    half_size = int((size_m / meters_per_pixel) / 2)

    window = rasterio.windows.Window(
      px - half_size,
      py - half_size,
      half_size * 2,
      half_size * 2
    )

    patch = self.ortho.read(1, window=window)
    origin_px = int(window.col_off)
    origin_py = int(window.row_off)
    return patch, origin_px, origin_py

  def get_ground_alt(self, lat, lon):
    px, py = self.geo_to_pixel(lat, lon)
    return self.dem.read(1)[py, px]
