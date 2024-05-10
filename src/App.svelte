<script lang="ts">
  import { onMount } from "svelte";
  import { Muxer, ArrayBufferTarget } from "mp4-muxer";
  let videoEl: HTMLVideoElement;
  let isRecording = false;
  let encoder: VideoEncoder;
  let muxer: Muxer<ArrayBufferTarget>;
  let intervalId: number;
  let framesGenerated = 0;
  let allChunks: Uint8Array[] = [];
  let startTime: number;
  let lastKeyFrame = -Infinity;
  let devices: MediaDeviceInfo[] = [];
  $: audioInputDevices = devices.filter(
    (device) => device.kind === "audioinput"
  );
  $: videoInputDevices = devices.filter(
    (device) => device.kind === "videoinput"
  );
  let currentDevice: MediaDeviceInfo | null = null;
  $: if (currentDevice) loadDevice(currentDevice);

  async function loadDevice(device: MediaDeviceInfo) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: device.deviceId,
      },
    });
    const track = stream.getVideoTracks()[0];
    const trackCapabilities = track.getCapabilities();
    videoEl.srcObject = stream;
    videoEl.onloadedmetadata = () => {
      videoEl.play();
      videoEl.onloadedmetadata = null;
    };
    const width = 640 || trackCapabilities.width?.max || videoEl.width;
    const height = 480 || trackCapabilities.height?.max || videoEl.height;

    await loadMuxerAndEncoder(width, height);
  }

  async function loadMuxerAndEncoder(width: number, height: number) {
    muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: "avc",
        width,
        height,
      },
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });

    encoder = new VideoEncoder({
      output: (chunk, metadata) => muxer.addVideoChunk(chunk, metadata),
      error: console.error,
    });

    encoder.configure({
      codec: "avc1.640032",
      width,
      height,
      hardwareAcceleration: "prefer-hardware",
      bitrate: 20_000_000,
    });
  }
  onMount(async () => {
    devices = await navigator.mediaDevices.enumerateDevices();
    console.log(devices);
    // currentDevice = videoInputDevices[0];
  });

  function startRecording() {
    isRecording = true;
    startTime = document.timeline.currentTime as number;
    lastKeyFrame = -Infinity;
    intervalId = setInterval(encodeVideoFrame, 1000 / 30);
  }

  async function endRecording() {
    isRecording = false;
    clearInterval(intervalId);
    framesGenerated = 0;

    await encoder.flush();
    muxer.finalize();

    const buffer = muxer.target.buffer;
    downloadBlob(new Blob([buffer]), "davinci.mp4");

    // downloadBlob(new Blob(allChunks), "davinci.yuv");
    allChunks = [];
  }

  async function encodeVideoFrame() {
    let elapsedTime = (document.timeline.currentTime as number) - startTime;
    const frame = new VideoFrame(videoEl, {
      timestamp: (framesGenerated * 1e6) / 30, // Ensure equally-spaced frames every 1/30th of a second
      duration: 1e6 / 30,
      alpha: "keep",
    });
    framesGenerated++;

    const uint8 = new Uint8Array(frame.allocationSize());
    frame.copyTo(uint8);
    allChunks.push(uint8);

    // Ensure a video key frame at least every 5 seconds for good scrubbing
    let needsKeyFrame = elapsedTime - lastKeyFrame >= 5000;
    if (needsKeyFrame) lastKeyFrame = elapsedTime;
    encoder.encode(frame, { keyFrame: needsKeyFrame });
    frame.close();
  }

  function downloadBlob(blob: Blob, name: string) {
    let url = window.URL.createObjectURL(blob);
    let a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  }
</script>

<select>
  {#each videoInputDevices as device}
    <option>{device.label || device.deviceId}</option>
  {/each}
</select>
{#if !isRecording}
  <button on:click={startRecording}>Start recording</button>
{:else}
  <button on:click={endRecording}>End recording</button>
{/if}
<br />
<!-- svelte-ignore a11y-media-has-caption -->
<video bind:this={videoEl} playsinline></video>
