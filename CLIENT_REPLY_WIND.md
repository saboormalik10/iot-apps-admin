# Client Reply — Wind Data Stream

**To:** Dana Galbraith
**Re:** Wind speed / direction stream — received and reviewed
**Date:** 2026-08-18
**Status:** Draft — review before sending

---

**Subject:** Re: Wind data — received, and one thing to check at your end

Hi Dana,

Thanks for rebooting. The wind data is arriving and still coming in as I write —
828 files so far, covering about 14 hours. We've been through it and can work with
it. Two things worth flagging, then three short questions.

**The files are CSV, not NMEA**

Not a problem at all — easier for us, in fact. Something between the sensor and the
upload (the OMC-409, at a guess) is already decoding the sensor output, so what
reaches us looks like this:

    timestamp,direction,speed,units,status
    2026-08-18T11:21:00+10:00,291,1.80,K,A

That's a good format to receive. The timestamps carry the +10:00 offset explicitly,
which removes any doubt about time zones — that was one of our open questions and
it's now closed.

**About half the readings aren't reaching us**

This is the one worth acting on. The sensor is sampling once a second, but each
file arrives holding only part of its minute — sometimes 50 seconds' worth,
sometimes 3. Across the 14 hours we have roughly 25,000 readings where a complete
1 Hz feed would be about 49,000. Around 38 minutes are missing altogether.

The cause looks like the upload timer. The gap between uploads is consistently 61
seconds rather than 60, so the upload slowly slides later relative to the clock,
and each run sends the current minute's file while it's still being written. The
rest of that minute is then lost when the file rolls over.

The usual fix is to run the upload on a scheduled job aligned to the minute, and
have it send the *previous* completed minute's file rather than the one currently
open. If that timer is something you or the installer can reach, that alone should
recover the missing half.

We can start building against the data as it is — no need to wait. But the
dashboard will show gaps until that's sorted, and we'd rather you knew the reason
was upstream and fixable.

**Three questions**

1. **How do we tell one station from another?** Still the important one. I notice an
   empty `OMC409` folder in the upload directory — if the intention is a folder per
   station, that works well for us. Just confirm and we'll build around it. The file
   name prefix on its own won't do it: it already changed from `wind_` to
   `WindSonic_` partway through yesterday.

2. **Does the station have a fixed public IP address?** If so we can lock the upload
   login to that address alone — the single biggest security improvement available
   to us here.

3. **Will the wind alarms, water quality and air quality units send the same way?**
   Same route, and is the format similar or different for each? If they differ we'd
   rather allow for it now than retrofit later.

One small confirmation too: we're reading the `K` in the units column as km/h, which
gives readings averaging about 6 km/h over the period — plausible for the site. If
it means knots we'd be out by a factor of about 1.9, so worth a moment's check.

Best regards,
Hassan
