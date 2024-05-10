<script lang="ts">
  import { onMount } from "svelte";
  let videoEl: HTMLVideoElement;
  let isRecording = false;
  let encoder: VideoEncoder;
  let intervalId: number;
  let framesGenerated = 0;
  let allChunks: Uint8Array[] = [];
  onMount(async () => {
    const device = await navigator.mediaDevices.getUserMedia({
      video: true,
    });
    const track = device.getVideoTracks()[0];
    const trackCapabilities = track.getCapabilities();
    videoEl.srcObject = device;

    encoder = new VideoEncoder({
      async output(chunk, metadata) {
        console.log({ chunk, metadata });
      },
      error(err) {
        console.error(err);
      },
    });
    encoder.configure({
      codec: "avc1.4d0034",
      width: trackCapabilities.width?.max || videoEl.width,
      height: trackCapabilities.height?.max || videoEl.height,
      hardwareAcceleration: "prefer-hardware",
      bitrate: 20_000_000,
    });
  });

  function startRecording() {
    isRecording = true;
    intervalId = setInterval(encodeVideoFrame, 1000 / 30);
  }

  function endRecording() {
    isRecording = false;
    clearInterval(intervalId);
    framesGenerated = 0;
    downloadBlob(new Blob(allChunks));
    allChunks = [];
  }

  async function encodeVideoFrame() {
    const frame = new VideoFrame(videoEl, {
      timestamp: (framesGenerated * 1e6) / 30, // Ensure equally-spaced frames every 1/30th of a second
      duration: 1e6 / 30,
      alpha: "keep",
    });
    framesGenerated++;
    const uint8 = new Uint8Array(frame.allocationSize());
    frame.copyTo(uint8);
    frame.close();
    allChunks.push(uint8);
  }

  function downloadBlob(blob: Blob) {
    let url = window.URL.createObjectURL(blob);
    let a = document.createElement("a");
    a.style.display = "none";
    a.href = url;
    a.download = "davinci.yuv";
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
  }
</script>

{#if !isRecording}
  <button on:click={startRecording}>Start recording</button>
{:else}
  <button on:click={endRecording}>End recording</button>
{/if}
<!-- svelte-ignore a11y-media-has-caption -->
<video bind:this={videoEl} autoplay></video>
