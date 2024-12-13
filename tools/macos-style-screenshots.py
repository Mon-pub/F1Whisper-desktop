from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps, features
import os

# Title bar
TITLE_BAR_HEIGHT = 60
TRAFFIC_LIGHT_BUTTON_RADIUS = 10
TRAFFIC_LIGHT_BUTTON_MARGIN = 15
# The offset between buttons
TRAFFICT_LIGHT_BUTTON_OFFSET = 10

# Rounded corners
ROUND_CORNER_RADIUS = 20

# Shadow
SHADOW_OFFSET = (80,80)
SHADOW_OPACITY = 80
BLUR_RADIUS = 10

# Create a macOS-style title bar
def add_title_bar(image, title, darkmode):
    width, height = image.size
    # Create a new image with added space for the title bar
    new_image = Image.new("RGBA", (width, height + TITLE_BAR_HEIGHT), (255, 255, 255, 255))

    # Paste the original image below the title bar
    new_image.paste(image, (0, TITLE_BAR_HEIGHT))

    draw = ImageDraw.Draw(new_image)

    # Draw the title bar
    title_bar_color = (240, 240, 240) if not darkmode else (40, 40, 40)
    draw.rectangle([0, 0, width, TITLE_BAR_HEIGHT], fill=title_bar_color)

    # Add traffic light buttons
    traffic_light_colors = [(255, 59, 48), (255, 204, 0), (50, 205, 50)]

    for i, color in enumerate(traffic_light_colors):
        x = TRAFFIC_LIGHT_BUTTON_MARGIN + i * (TRAFFIC_LIGHT_BUTTON_RADIUS * 2 + TRAFFICT_LIGHT_BUTTON_OFFSET)
        y = TITLE_BAR_HEIGHT // 2 - TRAFFIC_LIGHT_BUTTON_RADIUS
        draw.ellipse([x, y, x + TRAFFIC_LIGHT_BUTTON_RADIUS * 2, y + TRAFFIC_LIGHT_BUTTON_RADIUS * 2], fill=color)

    # Add the window title in the center of the title bar
    font = ImageFont.truetype('LabGrotesque-Bold.otf', 23)
    bbox =  draw.textbbox((0,0 ), title, font)
    title_width = bbox[2] - bbox[0]
    title_height = bbox[3] - bbox[1]
    title_x = (width - title_width) // 2
    title_y = (TITLE_BAR_HEIGHT - title_height) // 2
    draw.text((title_x, title_y), title, font=font, fill=(0, 0, 0) if not darkmode else (140, 140, 140))

    return new_image

def round_corners(image):

    # Create a mask with a rounded rectangle
    width, height = image.size
    mask = Image.new('L', (width, height), 0)
    draw = ImageDraw.Draw(mask)

    # Draw a white rounded rectangle on the mask
    draw.rounded_rectangle([0, 0, width, height], radius=ROUND_CORNER_RADIUS, fill=255)

    # Apply the mask to the image
    image.putalpha(mask)

    # Create a new image with rounded corners
    image_with_rounded_corners = ImageOps.fit(image, (width, height))

    return image_with_rounded_corners, mask

# Create a function to add a drop shadow to the image
def add_shadow(image, mask, darkmode):

    shadow_color = (153,153,153, 255) if not darkmode else (0, 0, 0, 255)
    width, height = image.size
    shadow = Image.new("RGBA", (width + SHADOW_OFFSET[0], height + SHADOW_OFFSET[1]), shadow_color)
    shadow.paste(image, (SHADOW_OFFSET[0] // 2, SHADOW_OFFSET[1] // 2), mask=mask)

    # Blur the shadow
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=BLUR_RADIUS))

    expandedImage = ImageOps.expand(image, (SHADOW_OFFSET[0] // 2, SHADOW_OFFSET[1] // 2), (0,0,0,0))

    finalImage = Image.alpha_composite(shadow, expandedImage)

    return finalImage


screenshots_path = "build/playwright/screenshots/marketing"
screenshots_out_path = 'build/playwright/screenshots/out'
for build in os.walk(screenshots_path):
    for build_folder in build[1]:
        output_path = os.path.join(screenshots_out_path, 'macOS', build_folder)
        if not os.path.exists(output_path):
            os.makedirs(output_path)
        for root, _, screenshot_paths in os.walk(os.path.join(screenshots_path, build_folder)):
            for screenshot_name in screenshot_paths:
                screenshot_path = os.path.join(root, screenshot_name)
                darkmode = 'Dark' in screenshot_path
                title = 'Threema' if 'consumer' in screenshot_path else 'Threema Work'
                image = Image.open(screenshot_path)
                # Add the title bar and shadow
                image_with_title_bar = add_title_bar(image, title, darkmode)
                image_with_rounded_corner, mask = round_corners(image_with_title_bar)

                image_with_shadow = add_shadow(image_with_rounded_corner, mask, darkmode)
                # Save the final image
                image_with_shadow.save(os.path.join(output_path, os.path.basename(screenshot_path)))


print("Successfully generated images")


