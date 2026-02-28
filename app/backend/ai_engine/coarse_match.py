import cv2


def coarse_match(tile, map_patch):
  small_map = cv2.resize(map_patch, (0, 0), fx=0.25, fy=0.25)
  small_tile = cv2.resize(tile, (0, 0), fx=0.25, fy=0.25)

  result = cv2.matchTemplate(
    small_map,
    small_tile,
    cv2.TM_CCOEFF_NORMED
  )

  _, max_val, _, max_loc = cv2.minMaxLoc(result)

  return max_val, max_loc
