#!/bin/env/python3
"""
RTSP client for getting video stream from SIYI cameras, e.g. ZR10, A8 Mini
ZR10 webpage: http://en.siyi.biz/en/Gimbal%20Camera/ZR10/overview/
A8 mini page: https://shop.siyi.biz/products/siyi-a8-mini?VariantsId=10611
Author : Mohamed Abdelkader
Email: mohamedashraf123@gmail.com
Copyright 2022

Required:
- OpenCV
    (sudo apt-get install python3-opencv -y)
- imutils
    pip install imutils
- Gstreamer (https://gstreamer.freedesktop.org/documentation/installing/index.html?gi-language=c)
    (Ubuntu: sudo apt-get install libgstreamer1.0-dev libgstreamer-plugins-base1.0-dev libgstreamer-plugins-bad1.0-dev gstreamer1.0-plugins-base gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav gstreamer1.0-doc gstreamer1.0-tools gstreamer1.0-x gstreamer1.0-alsa gstreamer1.0-gl gstreamer1.0-gtk3 gstreamer1.0-qt5 gstreamer1.0-pulseaudio -y)
- Deepstream (only for Nvidia Jetson boards)
    (https://docs.nvidia.com/metropolis/deepstream/dev-guide/text/DS_Quickstart.html#jetson-setup)
- For RTMP streaming
    sudo apt install ffmpeg -y
    pip install ffmpeg-python
"""
import cv2
import logging
import os
from time import time, sleep
import threading
import platform
from urllib.parse import urlparse, urlunparse

class SIYIRTSP:
    def __init__(self, rtsp_url="rtsp://192.168.144.25:8554/main.264", cam_name="ZR10", debug=False, use_udp=True) -> None:
        '''
        Receives video stream from SIYI cameras

        Params
        --
        - rtsp_url [str] RTSP url
        - cam_name [str] camera name (optional)
        - debug [bool] print debug messages
        - use_udp [bool] use UDP instead of TCP for RTSP transport
        '''
        self._original_rtsp_url = rtsp_url  # Keep the original URL intact
        self._rtsp_url = self._update_url_for_udp(rtsp_url, use_udp)
        self._cam_name = cam_name
        self._use_udp = use_udp  # Track whether we are trying UDP or TCP

        # Desired image width/height
        self._width = 640  # Lower resolution to reduce data size
        self._height = 480

        # Stored image frame
        self._frame = None

        # Configure logging
        self._debug = debug
        self._logger = logging.getLogger(self.__class__.__name__)
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(logging.Formatter('[%(levelname)s] %(asctime)s [SIYIRTSP::%(funcName)s]: %(message)s'))
        self._logger.addHandler(console_handler)
        self._logger.setLevel(logging.DEBUG if self._debug else logging.INFO)

        # Flag to stop frame grabbing loop and close windows
        self._stopped = False
        self._recv_thread = None  # Initialize thread variable
        self._stream = None
        self._lock = threading.Lock()
        self._connected = False
        self._prefer_tcp_reconnect = False

        # Show grabbed frame in a window (mainly for debugging)
        self._show_window = False

        self._last_image_time = time()

        # Timeout (seconds) before closing everything
        self._connection_timeout = 2.0

        # Start stream
        self.start()

    def setShowWindow(self, f: bool):
        self._show_window = f

    def getFrame(self):
        """
        Returns current image frame
        """
        return self._frame

    def isOpened(self):
        return bool(self._connected and self._stream is not None and self._stream.isOpened())

    def _candidate_urls(self):
        """
        Build a small list of common SIYI RTSP endpoint variants.
        """
        urls = []
        seen = set()

        def _append(url):
            if url and url not in seen:
                seen.add(url)
                urls.append(url)

        # After a timeout, prefer TCP/default first because UDP links can freeze
        # on lossy networks and return stale frames.
        if self._prefer_tcp_reconnect:
            _append(self._original_rtsp_url)
            _append(self._update_url_for_udp(self._original_rtsp_url, self._use_udp))
        else:
            _append(self._update_url_for_udp(self._original_rtsp_url, self._use_udp))
            _append(self._original_rtsp_url)

        parsed = urlparse(self._original_rtsp_url)
        if parsed.scheme == "rtsp" and parsed.netloc:
            query = parsed.query
            for path in ("/main.264", "/main", "/live.264", "/live"):
                if parsed.path == path:
                    continue
                _append(
                    urlunparse(
                        (parsed.scheme, parsed.netloc, path, "", query, "")
                    )
                )
        return urls

    def _open_stream(self, url):
        backends = [
            (cv2.CAP_FFMPEG, "ffmpeg"),
            (None, "opencv-default"),
        ]

        for backend, backend_name in backends:
            if backend == cv2.CAP_FFMPEG and "OPENCV_FFMPEG_CAPTURE_OPTIONS" not in os.environ:
                os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = (
                    "rtsp_transport;udp|fflags;nobuffer|flags;low_delay|max_delay;0|probesize;32|analyzeduration;0|stimeout;2000000|rw_timeout;2000000|timeout;2000000"
                )
            if backend is None:
                stream = cv2.VideoCapture(url)
            else:
                stream = cv2.VideoCapture(url, backend)
            stream.set(cv2.CAP_PROP_BUFFERSIZE, 1)
            stream.set(cv2.CAP_PROP_FRAME_WIDTH, self._width)
            stream.set(cv2.CAP_PROP_FRAME_HEIGHT, self._height)
            stream.set(cv2.CAP_PROP_FPS, 15)
            if hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC"):
                stream.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 2000)
            if hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC"):
                stream.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, 2000)
            if stream.isOpened():
                self._logger.info("Opened RTSP stream using backend=%s", backend_name)
                return stream
            stream.release()

        return cv2.VideoCapture()

    def start(self):
        """
        Start receiving thread
        """
        if self._recv_thread and self._recv_thread.is_alive():
            return

        try:
            selected_url = None
            for candidate in self._candidate_urls():
                transport = "UDP" if "rtsp_transport=udp" in candidate else "TCP/default"
                self._logger.info("Connecting to %s using %s (%s)...", self._cam_name, transport, candidate)
                stream = self._open_stream(candidate)
                if stream.isOpened():
                    selected_url = candidate
                    self._stream = stream
                    break
                stream.release()

            if selected_url is None:
                raise Exception(f"Failed to open RTSP stream. Tried: {', '.join(self._candidate_urls())}")

            self._rtsp_url = selected_url
            self._connected = True
            self._stopped = False
            self._recv_thread = threading.Thread(target=self.loop)
            self._recv_thread.start()
        except Exception as e:
            self._connected = False
            self._logger.error("Could not receive stream from %s. Error: %s", self._cam_name, e)
            self.close()

    def close(self):
        self._stopped = True
        current_thread = threading.current_thread()
        if self._recv_thread and self._recv_thread.is_alive() and self._recv_thread is not current_thread:
            self._recv_thread.join(timeout=2.0)
        with self._lock:
            if self._stream is not None:
                self._logger.info("Closing stream of %s...", self._cam_name)
                self._stream.release()
                self._stream = None
        self._connected = False
        if self._show_window:
            cv2.destroyAllWindows()

    def _attempt_reconnect(self):
        """
        Attempt to re-open the RTSP stream after a timeout.
        Keeps trying while client is running.
        """
        while not self._stopped:
            for candidate in self._candidate_urls():
                transport = "UDP" if "rtsp_transport=udp" in candidate else "TCP/default"
                self._logger.warning("Reconnecting %s using %s (%s)...", self._cam_name, transport, candidate)
                stream = self._open_stream(candidate)
                if stream.isOpened():
                    with self._lock:
                        self._stream = stream
                        self._rtsp_url = candidate
                        self._connected = True
                        self._prefer_tcp_reconnect = False
                    self._last_image_time = time()
                    self._logger.info("Reconnected stream for %s", self._cam_name)
                    return True
                stream.release()
            sleep(0.5)
        return False

    def loop(self):
        self._last_image_time = time()

        while not self._stopped:
            with self._lock:
                if self._stream is None:
                    break
                ret, frame = self._stream.read()

            if not ret:
                if (time() - self._last_image_time) > self._connection_timeout:
                    self._logger.warning("Connection timeout. Attempting stream reconnect.")
                    with self._lock:
                        if self._stream is not None:
                            self._stream.release()
                            self._stream = None
                        self._connected = False
                        self._prefer_tcp_reconnect = True
                    if not self._attempt_reconnect():
                        break
                    continue
                continue

            self._frame = frame
            self._last_image_time = time()

            # Log the timestamp
            with self._lock:
                if self._stream is None:
                    break
                timestamp = self._stream.get(cv2.CAP_PROP_POS_MSEC)
            if timestamp == 0:
                timestamp = time() * 1000  # Convert seconds to milliseconds for consistency
            self._logger.debug(f"Frame timestamp: {timestamp} ms")

            if self._show_window:
                cv2.imshow('{} Stream'.format(self._cam_name), self._frame)
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    self._stopped = True
                    break

            # Optimized delay to avoid overwhelming CPU while reducing latency
            sleep(0.001)

        self.close()
        self._logger.warning("RTSP receiving loop is done")
        return

    def _update_url_for_udp(self, rtsp_url, use_udp):
        """
        Modify the RTSP URL to use UDP transport if specified
        """
        if use_udp:
            if "rtsp_transport" not in rtsp_url:
                # Add UDP transport to the URL
                if '?' in rtsp_url:
                    return f"{rtsp_url}&rtsp_transport=udp"
                else:
                    return f"{rtsp_url}?rtsp_transport=udp"
        return rtsp_url

class RTMPSender:
    '''
    Streams image frames to an RTMP server
    '''
    def __init__(self, rtmp_url="rtmp://127.0.0.1:1935/live/webcam", debug=False) -> None:
        '''
        Params
        --
        - rtmp_url [str] RTMP server URL
        - debug [bool] Printing debug message
        '''
        self._rtmp_url=rtmp_url
        # Desired frequency of streaming to rtmp server
        self._fps =30

        self._last_send_time = time()
        self._current_send_time = time()


        # Frame to send
        self._frame = None

        # Desired image height
        self._height = 480
        # Desired image width
        self._width = 640

        self._toGray=False
        if self._toGray:
            self._pix_fmt="gray"
        else:
            self._pix_fmt="bgr24"

        # Flag to stop streaming loop
        self._stopped = False

        self._debug= debug # print debug messages
        if self._debug:
            d_level = logging.DEBUG
        else:
            d_level = logging.INFO
        LOG_FORMAT=' [%(levelname)s] %(asctime)s [RTMPSender::%(funcName)s] :\t%(message)s'
        logging.basicConfig(format=LOG_FORMAT, level=d_level)
        self._logger = logging.getLogger(self.__class__.__name__)

        # Streaming thread
        self._st_thread = threading.Thread(target=self.loop)

        
    def setImageSize(self, w=640, h=480):
        self._width=w
        self._height=h

    def setFPS(self, fps=20):
        self._fps=fps

    def setGrayFrame(self, b: bool):
        '''
        Params
        --
        - b [bool] True: sends grayscale image. Otherwise sends color image
        '''
        self._toGray = b
        if self._toGray:
            self._pix_fmt="gray"
        else:
            self._pix_fmt="bgr24"


    def setFrame(self, frame):
        self._frame=frame


    def start(self):
        command = ["ffmpeg",
            "-y",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-pix_fmt", self._pix_fmt,
            "-s", "{}x{}".format(self._width, self._height),
            "-r", str(self._fps),
            "-i", "-",
            "-c:v", "libx264",
            '-pix_fmt', 'yuv420p',
            "-preset", "ultrafast",
            "-f", "flv",
            "-tune", "zerolatency",
            self._rtmp_url]
        # using subprocess and pipe to fetch frame data
        try:
            self._p = subprocess.Popen(command, stdin=subprocess.PIPE)
        except Exception as e:
            self._logger.error("Could not create ffmpeg pipeline. Error %s", e)
            exit(1)

        try:
            self._st_thread.start()
        except Exception as e:
            self._logger.error("Could not start RTMP streaming thread")
            exit(1)

    def stop(self):
        """
        Stops streaming thread
        """
        self._logger.warning("RTMP streaming is stopped.")
        self._stopped=True
        self._p.kill()

    def sendFrame(self) -> bool:
        '''
        Sends current image frame stored in self._frame

        Returns
        --
        True if all is fine. False otherwise
        '''
        if self._frame is None:
            return False

        try:
            val = self._frame.shape
            rows = val[0]
            cols=val[1]
            # Resize the image, if needed
            if rows != self._height or cols != self._width:
                self._frame = cv2.resize(self._frame, (self._width,self._height), interpolation = cv2.INTER_AREA)

            if self._toGray and (len(self._frame.shape) > 2):
                self._frame = cv2.cvtColor(self._frame, cv2.COLOR_BGR2GRAY)

            self._p.stdin.write(self._frame.tobytes())

            return(True)
        except Exception as e:
            self._logger.error(" Error in sending:  %s", e)
            return(False)

    def loop(self):
        while(not self._stopped):
            dt = time() - self._last_send_time
            start_t=time()
            self.sendFrame()
            end_t=time()
            dt=end_t-start_t
            duration = 1/self._fps
            if  dt < duration:
                sleep(duration-dt)

        self._logger.warning("RTMP streaming loop is done")
        return

        


def test():
    # rtsp = SIYIRTSP(debug=False)
    # rtsp.setShowWindow(True)
    # Webcam
    try:
        wc = VideoStream(src=0).start()
    except Exception as e:
        print("Error in opening webcam")
        exit(1)

    rtmp = RTMPSender(rtmp_url="rtmp://127.0.0.1:1935/live/webcam")
    rtmp.start()
    try:
        while(True):
            # frame=stream.getFrame()
            frame=wc.read()
            rtmp.setFrame(frame)
    except KeyboardInterrupt:
        # rtsp.close()
        rtmp.stop()
        wc.stop()
        cv2.destroyAllWindows()
        # quit
        exit(0)

    

if __name__=="__main__":
    test()
