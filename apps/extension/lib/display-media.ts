interface TabCaptureConstraints extends MediaTrackConstraints {
  mandatory: {
    chromeMediaSource: "tab"
    chromeMediaSourceId: string
  }
}

function tabCaptureTrackConstraints(streamId: string): TabCaptureConstraints {
  return {
    mandatory: {
      chromeMediaSource: "tab",
      chromeMediaSourceId: streamId,
    },
  }
}

export async function requestTabCaptureStream(
  tabId: number
): Promise<MediaStream> {
  try {
    return await getTabMediaStream(tabId, true)
  } catch {
    return await getTabMediaStream(tabId, false)
  }
}

async function getTabMediaStream(
  tabId: number,
  withAudio: boolean
): Promise<MediaStream> {
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId,
  })

  return navigator.mediaDevices.getUserMedia({
    audio: withAudio ? tabCaptureTrackConstraints(streamId) : false,
    video: tabCaptureTrackConstraints(streamId),
  } as MediaStreamConstraints)
}
